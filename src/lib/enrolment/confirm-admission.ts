import { and, eq, isNull } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { enrolments, feeStructures, leads, pipelineStages } from "@/lib/db/schema";

export interface ConfirmAdmissionInput {
  leadId: string;
  course: string;
  centerId: string;
  mode: string;
  academicYear: string;
  /** Overrides the fee_structures lookup when no matching row exists yet. */
  totalFeePaiseOverride?: number | null;
  discountPaise?: number;
  confirmedBy: string | null;
}

export interface ConfirmAdmissionResult {
  enrolmentId: string;
  totalFeePaise: number;
  netFeePaise: number;
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
      throw new Error(
        `confirmAdmission: no fee structure for ${input.course}/${input.mode}/${input.academicYear} at this centre — provide totalFeePaiseOverride`,
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

  return { enrolmentId: enrolment.id, totalFeePaise, netFeePaise };
}
