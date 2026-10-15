import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { enrolments, leadIdentifiers, leads, payments, students } from "@/lib/db/schema";

/**
 * Taking dropped admissions out of the CRM for good — the ones that were
 * only ever tests of the workflow.
 *
 * A drop is a fact about a real student and is kept on purpose (see
 * `dropAdmission`). A test admission that was dropped to try the button is
 * not a fact about anybody, and it was counting as a dropped admission in the
 * handover, scoreboard and marketing reports. This is the way out.
 *
 * ## What it does — soft deletes only
 *
 * Nothing is destroyed (CLAUDE.md: nothing is hard-deleted). The admission,
 * the student record and, optionally, the lead get `deleted_at`, which every
 * list and report already filters on. An administrator can put them back.
 *
 * ## What it deliberately does NOT do
 *
 * It never touches `payments` or `receipts`. The ledger is append-only: a
 * test payment stays on it, and reports that start from the admission or the
 * lead stop counting it, while a total taken straight off the ledger still
 * would. The number of payments and their net amount are returned so the
 * caller can say so plainly, and a reversal — the ledger's own correction — is
 * the way to zero the money.
 *
 * Only admissions that are already DROPPED are accepted. A live admission is
 * money and an obligation; it has to be dropped first, on purpose.
 */
export interface RemoveDroppedInput {
  enrolmentIds: string[];
  reason: string;
  removedBy: string;
  /** Also soft-delete the lead, when no other live admission belongs to it. */
  alsoDeleteLeads: boolean;
  at?: Date;
}

export interface RemovedAdmission {
  enrolmentId: string;
  leadId: string;
  studentId: string | null;
  course: string;
  leadDeleted: boolean;
  paymentCount: number;
  netPaymentPaise: number;
}

export interface RemoveDroppedResult {
  removed: RemovedAdmission[];
  /** Ids that were not removed, and why — never silently ignored. */
  skipped: Array<{ enrolmentId: string; why: string }>;
}

export async function removeDroppedAdmissions(
  tx: DbExecutor,
  input: RemoveDroppedInput,
): Promise<RemoveDroppedResult> {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("removeDroppedAdmissions: a reason is required");

  const at = input.at ?? new Date();
  const ids = [...new Set(input.enrolmentIds)];
  if (ids.length === 0) return { removed: [], skipped: [] };

  const found = await tx
    .select({
      id: enrolments.id,
      leadId: enrolments.leadId,
      studentId: enrolments.studentId,
      course: enrolments.course,
      droppedAt: enrolments.droppedAt,
      deletedAt: enrolments.deletedAt,
    })
    .from(enrolments)
    .where(inArray(enrolments.id, ids));

  const byId = new Map(found.map((row) => [row.id, row]));
  const skipped: RemoveDroppedResult["skipped"] = [];
  const eligible: typeof found = [];

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) skipped.push({ enrolmentId: id, why: "That admission does not exist." });
    else if (row.deletedAt) skipped.push({ enrolmentId: id, why: "Already removed." });
    else if (!row.droppedAt) {
      skipped.push({
        enrolmentId: id,
        why: "It is a live admission, not a dropped one. Drop it first if it is not going ahead.",
      });
    } else eligible.push(row);
  }

  if (eligible.length === 0) return { removed: [], skipped };

  const eligibleIds = eligible.map((row) => row.id);

  // What stays on the ledger, for the caller to report. Signed, so a refund
  // reduces the figure rather than adding to it.
  const paid = await tx
    .select({
      enrolmentId: payments.enrolmentId,
      count: sql<number>`count(*)`,
      net: sql<number>`coalesce(sum(case when ${payments.direction} = 'credit' then ${payments.amountPaise} else -${payments.amountPaise} end), 0)`,
    })
    .from(payments)
    .where(inArray(payments.enrolmentId, eligibleIds))
    .groupBy(payments.enrolmentId);
  const paidBy = new Map(paid.map((row) => [row.enrolmentId, row]));

  await tx.update(enrolments).set({ deletedAt: at }).where(inArray(enrolments.id, eligibleIds));

  const studentIds = eligible.flatMap((row) => (row.studentId ? [row.studentId] : []));
  if (studentIds.length > 0) {
    await tx
      .update(students)
      .set({ deletedAt: at })
      .where(and(inArray(students.id, studentIds), isNull(students.deletedAt)));
  }

  const deletedLeadIds = new Set<string>();
  if (input.alsoDeleteLeads) {
    for (const leadId of new Set(eligible.map((row) => row.leadId))) {
      // A lead that still has another live admission is not a test row.
      const [stillEnrolled] = await tx
        .select({ id: enrolments.id })
        .from(enrolments)
        .where(
          and(
            eq(enrolments.leadId, leadId),
            isNull(enrolments.deletedAt),
            isNull(enrolments.droppedAt),
          ),
        );
      if (stillEnrolled) continue;

      const updated = await tx
        .update(leads)
        .set({
          deletedAt: at,
          deletedBy: input.removedBy,
          deletedReason: reason,
          updatedAt: at,
        })
        .where(and(eq(leads.id, leadId), isNull(leads.deletedAt)))
        .returning({ id: leads.id });
      if (updated.length === 0) continue;

      // Release the phone number, as deleting a lead does anywhere else:
      // otherwise a number used in a test stays reserved by a record nobody
      // can see.
      await tx
        .update(leadIdentifiers)
        .set({ deletedAt: at, updatedAt: at })
        .where(and(eq(leadIdentifiers.leadId, leadId), isNull(leadIdentifiers.deletedAt)));
      deletedLeadIds.add(leadId);
    }
  }

  return {
    removed: eligible.map((row) => ({
      enrolmentId: row.id,
      leadId: row.leadId,
      studentId: row.studentId,
      course: row.course,
      leadDeleted: deletedLeadIds.has(row.leadId),
      paymentCount: Number(paidBy.get(row.id)?.count ?? 0),
      netPaymentPaise: Number(paidBy.get(row.id)?.net ?? 0),
    })),
    skipped,
  };
}

/** Dropped, not yet removed — what the cleanup screen lists. */
export const droppedAdmissionFilter = and(isNotNull(enrolments.droppedAt), isNull(enrolments.deletedAt));
