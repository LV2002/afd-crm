import { and, eq, isNull, sql } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { batches, dropdownOptions, enrolments, leads } from "@/lib/db/schema";

export interface ConfirmAdmissionInput {
  leadId: string;
  course: string;
  centerId: string;
  mode: string;
  academicYear: string;
  /**
   * Which class group they are joining, chosen by the counsellor at the
   * moment of confirming.
   *
   * The column has existed since Phase 4 and nothing ever set it, because
   * no screen asked. That left the batch to be filled in later by somebody
   * who was not in the conversation — so it mostly was not, and `students`
   * arrived at Gate 2 with no batch at all. Optional here, because an
   * institute that has not created its batches yet must still be able to
   * take an admission.
   */
  batchId?: string | null;
  /** A custom fee, used instead of the batch's own — for a negotiated or one-off price. */
  totalFeePaiseOverride?: number | null;
  discountPaise?: number;
  confirmedBy: string | null;
}

export interface ConfirmAdmissionResult {
  enrolmentId: string;
  totalFeePaise: number;
  netFeePaise: number;
  /**
   * The status change this admission made: what the lead was, and the
   * "Took admission" status it was moved to. Null when there was no such
   * status to move it to.
   *
   * Reported rather than assumed. The move has always been conditional on
   * an active option of kind `won` existing — an institute that deleted or
   * re-kinded "Took admission" got an admission recorded and a lead still
   * sitting at Hot, with nothing anywhere saying why. The caller needs to
   * know which happened in order to say so.
   */
  statusChange: { from: string | null; to: string } | null;
}

/**
 * Gate 1 (CLAUDE.md lifecycle chain: sales -> accounts). Runs on the direct
 * db client inside the caller's transaction, same bypass as
 * resolveOrCreateLead()/mergeLeads()/applyAssignment() — this writes across
 * `enrolments` and `leads` atomically and is a deliberate one-time state
 * transition, not generic CRUD any single RLS policy could express. The
 * calling Server Action re-implements the own/center/all scope check before
 * ever calling this (see confirmAdmissionAction in leads/[id]/actions.ts).
 *
 * "Lead work stops" (CLAUDE.md non-negotiable) is implemented by moving the
 * lead's status to the option of kind `won` — "Took admission" — which is
 * already excluded from My Day, the SLA sweep, the temperature cron and
 * reports, so this reuses that exclusion rather than touching the core
 * leads_update RLS policy. See docs/DECISIONS.md.
 *
 * ## This is the ONLY way into that status
 *
 * The `enforce_lead_status` trigger (migration 0099) refuses to set a
 * `won` status unless an enrolment already exists for the lead. That is
 * why the enrolment is inserted first and the status second, in this one
 * transaction: confirming an admission passes its own gate, and nothing
 * else can. A counsellor cannot mark a lead as having taken admission by
 * hand, which is the point.
 */
export async function confirmAdmission(
  tx: DbExecutor,
  input: ConfirmAdmissionInput,
): Promise<ConfirmAdmissionResult> {
  const discountPaise = input.discountPaise ?? 0;

  const [lead] = await tx.select().from(leads).where(eq(leads.id, input.leadId));
  if (!lead) {
    throw new Error(`confirmAdmission: lead ${input.leadId} not found`);
  }

  const [existing] = await tx
    .select({ id: enrolments.id })
    .from(enrolments)
    .where(and(eq(enrolments.leadId, input.leadId), isNull(enrolments.deletedAt)));
  if (existing) {
    throw new Error("confirmAdmission: this lead already has an enrolment");
  }

  // Fee order: a custom figure typed on the form, otherwise the batch's own fee.
  let totalFeePaise = input.totalFeePaiseOverride ?? null;
  if (totalFeePaise === null && input.batchId) {
    const [batch] = await tx
      .select({ feePaise: batches.feePaise })
      .from(batches)
      .where(eq(batches.id, input.batchId));
    totalFeePaise = batch?.feePaise ?? null;
  }
  if (totalFeePaise === null) {
    throw new Error(
      "This batch has no fee yet. Set it in Settings → Courses & Batches, or type a custom fee into \"Custom fee\".",
    );
  }

  const netFeePaise = totalFeePaise - discountPaise;
  if (netFeePaise < 0) {
    throw new Error("confirmAdmission: discount cannot exceed the total fee");
  }

  const now = new Date();

  const [enrolment] = await tx
    .insert(enrolments)
    .values({
      leadId: input.leadId,
      course: input.course,
      batchId: input.batchId ?? null,
      centerId: input.centerId,
      mode: input.mode,
      academicYear: input.academicYear,
      totalFeePaise,
      discountPaise,
      netFeePaise,
      enrolledAt: now,
      salesToAccountsAt: now,
      salesToAccountsBy: input.confirmedBy,
    })
    .returning({ id: enrolments.id });

  const [wonStatus] = await tx
    .select({ value: dropdownOptions.value })
    .from(dropdownOptions)
    .where(
      and(
        eq(dropdownOptions.category, "temperature"),
        eq(dropdownOptions.isActive, true),
        isNull(dropdownOptions.deletedAt),
        sql`${dropdownOptions.metadata} ->> 'kind' = 'won'`,
      ),
    )
    .orderBy(dropdownOptions.sortOrder)
    .limit(1);

  if (wonStatus) {
    await tx
      .update(leads)
      .set({
        temperature: wonStatus.value,
        // A fact about the enrolment, not a judgement that should expire.
        temperatureOverrideUntil: null,
        temperatureSetBy: input.confirmedBy,
      })
      .where(eq(leads.id, input.leadId));
  }

  return {
    enrolmentId: enrolment.id,
    totalFeePaise,
    netFeePaise,
    statusChange: wonStatus ? { from: lead.temperature, to: wonStatus.value } : null,
  };
}
