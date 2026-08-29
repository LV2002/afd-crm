"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/log";
import { db } from "@/lib/db/client";
import { leads, mergeReviewQueue } from "@/lib/db/schema";
import { mergeLeads } from "@/lib/identity/merge-leads";
import { createClient } from "@/lib/supabase/server";

export interface MergeActionResult {
  error?: string;
}

/**
 * mergeLeads() runs on the direct db client (see its own doc comment for
 * why), so — same pattern as createLeadManually()/importLeads() — this
 * action is the enforcement point: re-implements the own/center/all scope
 * check `can_access_center()` would apply, checked against BOTH leads in
 * the pairing before ever touching the database.
 */
export async function confirmMerge(queueId: string, reason: string): Promise<MergeActionResult> {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.merge")) {
    return { error: "You don't have permission to do that." };
  }
  const scope = scopeFor(user, "lead.merge");
  if (!scope) {
    return { error: "You don't have permission to do that." };
  }

  const [queueRow] = await db.select().from(mergeReviewQueue).where(eq(mergeReviewQueue.id, queueId));
  if (!queueRow || queueRow.status !== "pending") {
    return { error: "This pairing has already been reviewed." };
  }

  const [survivor] = await db.select().from(leads).where(eq(leads.id, queueRow.leadId));
  const [candidate] = await db.select().from(leads).where(eq(leads.id, queueRow.candidateLeadId));
  if (!survivor || !candidate) {
    return { error: "One of these leads no longer exists." };
  }

  if (scope !== "all") {
    const outOfScope = [survivor.centerId, candidate.centerId].some(
      (centerId) => centerId && !user.centerIds.includes(centerId),
    );
    if (outOfScope) {
      return { error: "One of these leads is outside your access." };
    }
  }

  await db.transaction(async (tx) => {
    await mergeLeads(tx, {
      survivorLeadId: queueRow.leadId,
      mergedLeadId: queueRow.candidateLeadId,
      mergedBy: user.id,
      reason: reason.trim() || null,
    });
    await tx
      .update(mergeReviewQueue)
      .set({ status: "confirmed", reviewedBy: user.id })
      .where(eq(mergeReviewQueue.id, queueId));
  });

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "lead.merge",
    entityType: "leads",
    entityId: queueRow.leadId,
    after: { mergedLeadId: queueRow.candidateLeadId, reason: reason.trim() || null },
  });

  revalidatePath("/leads/merge-review");
  revalidatePath("/leads");
  return {};
}

/**
 * Unlike confirmMerge(), rejecting is a single-row update to
 * merge_review_queue with nothing else to reassign — the
 * merge_review_queue_update RLS policy (gated on lead.merge against the
 * anchor lead, migration 0005) already covers exactly this, so this runs
 * through the normal RLS-bound client rather than the direct-client bypass
 * confirmMerge() needs for the actual cross-table merge.
 */
export async function rejectMerge(queueId: string, reason: string): Promise<MergeActionResult> {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.merge")) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();

  const { data: queueRow } = await supabase
    .from("merge_review_queue")
    .select("id, lead_id, candidate_lead_id, status")
    .eq("id", queueId)
    .maybeSingle<{ id: string; lead_id: string; candidate_lead_id: string; status: string }>();
  if (!queueRow || queueRow.status !== "pending") {
    return { error: "This pairing has already been reviewed." };
  }

  const { error } = await supabase
    .from("merge_review_queue")
    .update({ status: "rejected", reviewed_by: user.id })
    .eq("id", queueId);
  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "lead.merge_rejected",
    entityType: "leads",
    entityId: queueRow.lead_id,
    after: { candidateLeadId: queueRow.candidate_lead_id, reason: reason.trim() || null },
  });

  revalidatePath("/leads/merge-review");
  return {};
}
