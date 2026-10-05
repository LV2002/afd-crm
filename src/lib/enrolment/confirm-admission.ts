import { and, eq, isNull } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { enrolments, feeStructures, leads, pipelineStages } from "@/lib/db/schema";

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
  /** Overrides the fee_structures lookup when no matching row exists yet. */
  totalFeePaiseOverride?: number | null;
  discountPaise?: number;
  confirmedBy: string | null;
}

export interface ConfirmAdmissionResult {
  enrolmentId: string;
  totalFeePaise: number;
  netFeePaise: number;
  /**
   * The stage the lead was moved into, or null when there was none to
   * move it to.
   *
   * Reported rather than assumed. This move has always been part of
   * confirming an admission, and it has always been conditional on an
   * active `stage_type = 'won'` stage existing — so an institute that
   * renamed its stages, or built its pipeline from scratch and left every
   * stage as "normal", got an admission recorded and a lead still sitting
   * at Demo Scheduled, with nothing anywhere saying why. The caller needs
   * to know which happened in order to say so.
   */
  wonStageId: string | null;
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
 * lead into the seeded stage_type='won' pipeline stage — already excluded
 * from My Day, the SLA sweep, the temperature cron and reports, so this
 * reuses that exclusion rather than touching the core leads_update RLS
 * policy. See docs/DECISIONS.md.
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

  let totalFeePaise = input.totalFeePaiseOverride ?? null;
  if (totalFeePaise === null) {
    const [structure] = await tx
      .select({ baseFeePaise: feeStructures.baseFeePaise })
      .from(feeStructures)
      .where(
        and(
          eq(feeStructures.course, input.course),
          eq(feeStructures.centerId, input.centerId),
          eq(feeStructures.mode, input.mode),
          eq(feeStructures.academicYear, input.academicYear),
          eq(feeStructures.isActive, true),
          isNull(feeStructures.deletedAt),
        ),
      );
    if (!structure) {
      // Written for the counsellor who sees it on the form, not for the
      // developer who wrote it. The old wording ended "provide
      // totalFeePaiseOverride", which names a function argument nobody
      // outside this file has ever heard of; the field it means is
      // labelled "Manual fee override" two inches further up the screen.
      throw new Error(
        `No fee is set up for ${input.course} / ${input.mode} / ${input.academicYear} at this centre. ` +
          `Add it in Settings → Fee Structures, or type the amount into "Manual fee override".`,
      );
    }
    totalFeePaise = structure.baseFeePaise;
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

  const [wonStage] = await tx
    .select({ id: pipelineStages.id })
    .from(pipelineStages)
    .where(and(eq(pipelineStages.stageType, "won"), eq(pipelineStages.isActive, true)))
    .orderBy(pipelineStages.sortOrder)
    .limit(1);

  if (wonStage) {
    await tx.update(leads).set({ stageId: wonStage.id }).where(eq(leads.id, input.leadId));
  }

  return {
    enrolmentId: enrolment.id,
    totalFeePaise,
    netFeePaise,
    wonStageId: wonStage?.id ?? null,
  };
}
