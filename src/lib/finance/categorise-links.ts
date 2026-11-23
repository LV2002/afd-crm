import { and, eq, inArray, isNull } from "drizzle-orm";

import { can, scopeFor, type SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { enrolments, leads, students, type bankStatementLines } from "@/lib/db/schema";
import { payFromBankLine } from "@/lib/payroll/service";

import { resolveBankLines, type LineLink } from "./bank-ledger";
import { cleanComment } from "./comments";
import { splitCreditLine, type Allocation } from "./split-line";
import { isPeriod, type CategoryRule } from "./category-links";

/**
 * Files bank lines under a category, asking "whose is this?" where the
 * category says it matters:
 *
 *   enrolment  a student's fee — a payment and receipt on their profile
 *   student    tagged to a student (a fine) — no fee record
 *   employee   pays that person's payslip
 *
 * Everything runs in one transaction. If the third of five lines names a
 * payslip that cannot be paid, none of the five is recorded, and the message
 * says which line and why — half a batch is the hardest thing to untangle in
 * a ledger.
 */

type Line = typeof bankStatementLines.$inferSelect;

export type Categorised = { ok: true; done: number } | { ok: false; error: string };

class Refused extends Error {}

/** One of the per-line answers the form sends, keyed by kind and line id. */
export type LineAnswers = Record<string, string>;

export const answerKey = (
  kind: "enrolment" | "student" | "payslip" | "period" | "comment" | "split" | "gateway" | "gatewayFee",
  lineId: string,
) => `${kind}:${lineId}`;

/** The comment a person wrote beside a line, ready to store, or null. */
export function commentFor(answers: LineAnswers, lineId: string): string | null {
  return cleanComment(answers[answerKey("comment", lineId)]);
}

function parseAllocations(raw: string): Allocation[] | null {
  try {
    const list = JSON.parse(raw) as Array<{ enrolmentId?: unknown; amountPaise?: unknown }>;
    if (!Array.isArray(list)) return null;
    const out: Allocation[] = [];
    for (const item of list) {
      if (typeof item.enrolmentId !== "string" || typeof item.amountPaise !== "number") return null;
      out.push({ enrolmentId: item.enrolmentId, amountPaise: Math.round(item.amountPaise) });
    }
    return out;
  } catch {
    return null;
  }
}

function say(line: Line): string {
  return `“${line.particulars.slice(0, 40)}” on ${line.occurredOn}`;
}

export async function categoriseWithLinks(input: {
  lines: Line[];
  direction: "in" | "out";
  choice: string;
  rule: CategoryRule;
  actor: SessionUser;
  answers: LineAnswers;
  /** The centre chosen for the batch, when the account serves several. */
  centerId?: string | null;
  /** What a payment gateway's charge is filed under. */
  chargeCategory?: string;
}): Promise<Categorised> {
  const { lines, rule, actor, answers } = input;
  const links: Record<string, LineLink> = {};

  // The month a payment is for: optional, but when given it must be a real month.
  if (rule.asksPeriod) {
    for (const line of lines) {
      const period = (answers[answerKey("period", line.id)] ?? "").trim();
      if (!period) continue;
      if (!isPeriod(period)) return { ok: false, error: `The month for ${say(line)} is not valid.` };
      links[line.id] = { ...links[line.id], period };
    }
  }

  // Lines the person chose to split between several students (a gateway settlement).
  const splits = new Map<string, { allocations: Allocation[]; gatewayAccountId: string; gatewayFeePaise: number }>();
  if (rule.link === "enrolment") {
    if (!can(actor, "payment.record") || !scopeFor(actor, "payment.record")) {
      return { ok: false, error: "Recording a student's payment needs the payment permission." };
    }
    const scope = scopeFor(actor, "payment.record")!;
    for (const line of lines) {
      const raw = answers[answerKey("split", line.id)];
      if (!raw) continue;
      const allocations = parseAllocations(raw);
      if (!allocations || allocations.length === 0) return { ok: false, error: `Add the students for ${say(line)}.` };
      const gatewayAccountId = (answers[answerKey("gateway", line.id)] ?? "").trim();
      if (!gatewayAccountId) return { ok: false, error: `Choose the payment gateway account for ${say(line)}.` };
      const feeRupees = Number((answers[answerKey("gatewayFee", line.id)] ?? "0").replace(/,/g, "")) || 0;
      const found = await db
        .select()
        .from(enrolments)
        .where(and(inArray(enrolments.id, [...new Set(allocations.map((a) => a.enrolmentId))]), isNull(enrolments.deletedAt)));
      const byId = new Map(found.map((e) => [e.id, e]));
      for (const a of allocations) {
        const e = byId.get(a.enrolmentId);
        if (!e) return { ok: false, error: `A student chosen for ${say(line)} no longer has that admission.` };
        if (scope === "center" && !actor.centerIds.includes(e.centerId)) return { ok: false, error: `A student for ${say(line)} is outside your centres.` };
        if (scope === "own") {
          const [lead] = await db.select({ assignedTo: leads.assignedTo }).from(leads).where(eq(leads.id, e.leadId));
          if (!lead || lead.assignedTo !== actor.id) return { ok: false, error: `A student for ${say(line)} is outside your access.` };
        }
      }
      splits.set(line.id, { allocations, gatewayAccountId, gatewayFeePaise: Math.round(feeRupees * 100) });
    }
  }

  if (rule.link === "enrolment" || rule.link === "refund") {
    const permission = rule.link === "refund" ? "payment.refund" : "payment.record";
    const why = rule.link === "refund" ? "Recording a refund needs the refund permission." : "Recording a student's payment needs the payment permission.";
    if (!can(actor, permission)) return { ok: false, error: why };
    const scope = scopeFor(actor, permission);
    if (!scope) return { ok: false, error: why };

    const wanted = lines.filter((l) => !splits.has(l.id)).map((l) => ({ line: l, id: (answers[answerKey("enrolment", l.id)] ?? "").trim() }));
    const missing = wanted.find((w) => !w.id);
    if (missing) return { ok: false, error: `Choose whose ${rule.link === "refund" ? "refund" : "fee"} ${say(missing.line)} is.` };

    const found = await db
      .select()
      .from(enrolments)
      .where(and(inArray(enrolments.id, [...new Set(wanted.map((w) => w.id))]), isNull(enrolments.deletedAt)));
    const byId = new Map(found.map((e) => [e.id, e]));
    for (const { line, id } of wanted) {
      const enrolment = byId.get(id);
      if (!enrolment) return { ok: false, error: `The student chosen for ${say(line)} no longer has that admission.` };
      if (scope === "center" && !actor.centerIds.includes(enrolment.centerId)) {
        return { ok: false, error: `${say(line)} is for a student outside your centres.` };
      }
      if (scope === "own") {
        const [lead] = await db.select({ assignedTo: leads.assignedTo }).from(leads).where(eq(leads.id, enrolment.leadId));
        if (!lead || lead.assignedTo !== actor.id) return { ok: false, error: `${say(line)} is for a student outside your access.` };
      }
      links[line.id] = rule.link === "refund" ? { ...links[line.id], refundEnrolmentId: id } : { ...links[line.id], enrolmentId: id };
    }
  }

  if (rule.link === "student") {
    const wanted = lines.map((l) => ({ line: l, id: (answers[answerKey("student", l.id)] ?? "").trim() }));
    const missing = wanted.find((w) => !w.id);
    if (missing) return { ok: false, error: `Choose which student ${say(missing.line)} is from.` };
    const found = await db
      .select({ id: students.id, fullName: students.fullName })
      .from(students)
      .where(and(inArray(students.id, [...new Set(wanted.map((w) => w.id))]), isNull(students.deletedAt)));
    const byId = new Map(found.map((s) => [s.id, s]));
    for (const { line, id } of wanted) {
      const student = byId.get(id);
      if (!student) return { ok: false, error: `The student chosen for ${say(line)} was not found.` };
      links[line.id] = { ...links[line.id], studentId: student.id, studentName: student.fullName };
    }
  }

  if (rule.link === "employee") {
    if (!can(actor, "payroll.generate")) return { ok: false, error: "Recording a salary payment needs the payroll permission." };
    const wanted = lines.map((l) => ({ line: l, id: (answers[answerKey("payslip", l.id)] ?? "").trim() }));
    const missing = wanted.find((w) => !w.id);
    if (missing) return { ok: false, error: `Choose whose salary ${say(missing.line)} is.` };
  }

  try {
    const done = await db.transaction(async (tx) => {
      if (rule.link === "employee") {
        let paid = 0;
        for (const line of lines) {
          const result = await payFromBankLine(tx, {
            payslipId: (answers[answerKey("payslip", line.id)] ?? "").trim(),
            bankLineId: line.id,
            userId: actor.id,
          });
          if (!result.ok) throw new Refused(`${say(line)}: ${result.error}`);
          paid++;
        }
        return paid;
      }
      let split = 0;
      for (const line of lines) {
        const plan = splits.get(line.id);
        if (!plan) continue;
        try {
          await splitCreditLine(tx, {
            line,
            allocations: plan.allocations,
            gatewayFeePaise: plan.gatewayFeePaise,
            gatewayAccountId: plan.gatewayAccountId,
            feeCategory: input.choice,
            chargeCategory: input.chargeCategory ?? "Payment Gateway Charges",
            userId: actor.id,
          });
        } catch (error) {
          throw new Refused(`${say(line)}: ${error instanceof Error ? error.message : "could not be split."}`);
        }
        split++;
      }
      const rest = lines.filter((l) => !splits.has(l.id));
      const others = rest.length
        ? await resolveBankLines(tx, {
            lines: rest,
            direction: input.direction,
            choice: input.choice,
            skipReason: null,
            userId: actor.id,
            links,
            centerId: input.centerId ?? null,
          })
        : 0;
      return split + others;
    });
    return { ok: true, done };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.message };
    throw error;
  }
}
