import { and, eq, inArray, isNull } from "drizzle-orm";

import { can, scopeFor, type SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { enrolments, leads, students, type bankStatementLines } from "@/lib/db/schema";
import { payFromBankLine } from "@/lib/payroll/service";

import { resolveBankLines, type LineLink } from "./bank-ledger";
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

export const answerKey = (kind: "enrolment" | "student" | "payslip" | "period", lineId: string) => `${kind}:${lineId}`;

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

  if (rule.link === "enrolment") {
    if (!can(actor, "payment.record")) return { ok: false, error: "Recording a student's payment needs the payment permission." };
    const scope = scopeFor(actor, "payment.record");
    if (!scope) return { ok: false, error: "Recording a student's payment needs the payment permission." };

    const wanted = lines.map((l) => ({ line: l, id: (answers[answerKey("enrolment", l.id)] ?? "").trim() }));
    const missing = wanted.find((w) => !w.id);
    if (missing) return { ok: false, error: `Choose whose fee ${say(missing.line)} is.` };

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
      links[line.id] = { ...links[line.id], enrolmentId: id };
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
      return resolveBankLines(tx, {
        lines,
        direction: input.direction,
        choice: input.choice,
        skipReason: null,
        userId: actor.id,
        links,
      });
    });
    return { ok: true, done };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.message };
    throw error;
  }
}
