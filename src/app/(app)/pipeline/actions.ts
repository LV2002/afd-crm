"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export interface MoveLeadResult {
  error?: string;
}

/**
 * Moves a lead to a different pipeline stage from the kanban board.
 *
 * Authorization is RLS's job here, not this action's — `leads_update`
 * already scopes UPDATE to own/center/all via `lead.update`, same policy
 * `updateLead()` (the detail-page edit form) runs under. Unlike
 * `createLeadManually()`, there's no service-role/direct-client bypass to
 * re-implement scope logic for.
 *
 * The lost-reason requirement is enforced twice on purpose: here (so the
 * UI gets back a clean error message instead of a raw Postgres error) and
 * again by the `enforce_lost_reason` trigger (migration 0012), which is
 * the real backstop — it also covers every other write path to `leads`,
 * not just this one.
 */
export async function moveLeadStage(
  leadId: string,
  stageId: string,
  reason?: { lostReason?: string; lostReasonDetail?: string },
): Promise<MoveLeadResult> {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.update")) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();

  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("requires_reason")
    .eq("id", stageId)
    .maybeSingle<{ requires_reason: boolean }>();
  if (!stage) {
    return { error: "That stage no longer exists." };
  }

  const payload: Record<string, unknown> = { stage_id: stageId };
  if (stage.requires_reason) {
    if (!reason?.lostReason) {
      return { error: "A reason is required to move a lead into this stage." };
    }
    payload.lost_reason = reason.lostReason;
    payload.lost_reason_detail = reason.lostReasonDetail?.trim() || null;
  }
  // Moving into a stage that doesn't require a reason clears any stale
  // lost_reason/lost_reason_detail/lost_at automatically — that's the
  // enforce_lost_reason trigger's job, not this action's.

  const { error } = await supabase.from("leads").update(payload).eq("id", leadId);
  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "lead.stage_change",
    entityType: "leads",
    entityId: leadId,
    after: payload,
  });

  revalidatePath("/pipeline");
  return {};
}
