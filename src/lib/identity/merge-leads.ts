import { eq } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import {
  assignmentHistory,
  enquiries,
  interactions,
  leadIdentifiers,
  leadMerges,
  leads,
  mergeReviewQueue,
  stageHistory,
  tasks,
} from "@/lib/db/schema";

export interface MergeLeadsInput {
  /** The lead that survives — every other table's rows get reassigned onto this id. */
  survivorLeadId: string;
  /** The lead being merged away — soft-deleted at the end, never hard-deleted (CLAUDE.md non-negotiable #5). */
  mergedLeadId: string;
  mergedBy: string | null;
  reason?: string | null;
}

/**
 * CLAUDE.md's "Fixed in code" list: "Identity resolution and merge logic."
 * The one place two lead records actually become one. Runs on the direct
 * db client inside the caller's transaction (same bypass as
 * resolveOrCreateLead()/applyAssignment() — see docs/DECISIONS.md), since
 * reassigning rows across half a dozen tables needs to be atomic and none
 * of those tables have an RLS policy written for "move this row to a
 * different lead_id" as a caller-driven operation anyway.
 *
 * Every row that pointed at `mergedLeadId` now points at `survivorLeadId`
 * instead — enquiries, interactions, tasks, stage_history,
 * assignment_history, lead_identifiers (safe: two different leads can
 * never already hold the *same* (kind, value_normalised) pair, or they'd
 * already be one lead per lead_identifiers' own unique constraint). The
 * merged lead itself is soft-deleted with `merged_into_lead_id` set — its
 * row still exists, still resolvable, never hard-deleted — and a
 * `lead_merges` row captures a full snapshot of it as it was right before
 * the merge, for audit and manual undo if a reviewer ever gets this wrong.
 */
export async function mergeLeads(tx: DbExecutor, input: MergeLeadsInput): Promise<void> {
  const { survivorLeadId, mergedLeadId, mergedBy, reason } = input;
  if (survivorLeadId === mergedLeadId) {
    throw new Error("mergeLeads: a lead cannot be merged into itself");
  }

  const [mergedLead] = await tx.select().from(leads).where(eq(leads.id, mergedLeadId));
  if (!mergedLead) {
    throw new Error(`mergeLeads: lead ${mergedLeadId} not found`);
  }

  await tx.update(enquiries).set({ leadId: survivorLeadId }).where(eq(enquiries.leadId, mergedLeadId));
  await tx.update(interactions).set({ leadId: survivorLeadId }).where(eq(interactions.leadId, mergedLeadId));
  await tx.update(tasks).set({ leadId: survivorLeadId }).where(eq(tasks.leadId, mergedLeadId));
  await tx.update(stageHistory).set({ leadId: survivorLeadId }).where(eq(stageHistory.leadId, mergedLeadId));
  await tx
    .update(assignmentHistory)
    .set({ leadId: survivorLeadId })
    .where(eq(assignmentHistory.leadId, mergedLeadId));
  await tx
    .update(leadIdentifiers)
    .set({ leadId: survivorLeadId })
    .where(eq(leadIdentifiers.leadId, mergedLeadId));

  // Any OTHER pending review pairing one of these two leads with a third
  // lead needs to keep pointing at a live lead, not the one about to be
  // soft-deleted. A pairing that only existed because it named both sides
  // of *this* merge would become a self-reference once reassigned — reject
  // it outright instead, since a lead can't be a duplicate of itself.
  await tx
    .update(mergeReviewQueue)
    .set({ leadId: survivorLeadId })
    .where(eq(mergeReviewQueue.leadId, mergedLeadId));
  await tx
    .update(mergeReviewQueue)
    .set({ candidateLeadId: survivorLeadId })
    .where(eq(mergeReviewQueue.candidateLeadId, mergedLeadId));
  await tx
    .update(mergeReviewQueue)
    .set({ status: "rejected" })
    .where(eq(mergeReviewQueue.leadId, mergeReviewQueue.candidateLeadId));

  await tx
    .update(leads)
    .set({ deletedAt: new Date(), mergedIntoLeadId: survivorLeadId })
    .where(eq(leads.id, mergedLeadId));

  await tx.insert(leadMerges).values({
    survivorLeadId,
    mergedLeadId,
    mergedBy,
    reason: reason ?? null,
    snapshot: mergedLead as unknown as Record<string, unknown>,
  });
}
