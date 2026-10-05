"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { notify } from "@/lib/notifications/notify";
import { createClient } from "@/lib/supabase/server";

export interface AssignOrphanResult {
  error?: string;
}

/**
 * docs/02-BUILD-PHASES.md § Phase 2: "Orphan queue for centre heads" — a
 * lead the assignment engine matched no rule for sits with `assigned_to`
 * null until someone claims it by hand. Both writes here go through the
 * normal RLS-bound client with no bypass: `leads_update` is gated on
 * `lead.update` (which every role holding `lead.assign` already has —
 * see docs/DECISIONS.md), and `assignment_history_insert` was already
 * built (migration 0008) gated on `lead.assign` against the target lead
 * specifically so this exact screen could write here later without a
 * new migration.
 */
export async function assignOrphanLead(leadId: string, userId: string): Promise<AssignOrphanResult> {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.assign")) {
    return { error: "You don't have permission to do that." };
  }
  const scope = scopeFor(user, "lead.assign");
  if (!scope) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("id, center_id, assigned_to")
    .eq("id", leadId)
    .is("assigned_to", null)
    .maybeSingle<{ id: string; center_id: string | null; assigned_to: string | null }>();

  if (!lead) {
    return { error: "This lead is no longer unassigned — someone else may have already claimed it." };
  }
  if (scope !== "all" && (!lead.center_id || !user.centerIds.includes(lead.center_id))) {
    return { error: "This lead is outside your access." };
  }

  const { error } = await supabase.from("leads").update({ assigned_to: userId }).eq("id", leadId);
  if (error) {
    return { error: error.message };
  }

  await supabase.from("assignment_history").insert({
    lead_id: leadId,
    from_user: null,
    to_user: userId,
    from_center: lead.center_id,
    to_center: lead.center_id,
    rule_id: null,
    reason: "manual",
    actor_id: user.id,
  });

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "lead.assign",
    entityType: "leads",
    entityId: leadId,
    after: { assignedTo: userId },
  });

  // The one assignment path that never told anybody.
  //
  // A lead the rules engine assigns has always notified its new owner
  // (`notifyLeadArrived` in resolve-or-create-lead.ts); a lead a centre
  // head hands to a counsellor from this queue did not, so the counsellor
  // found out when they next happened to open their lead list. Which is
  // the worst case of the two, because this is the lead somebody has
  // already decided is worth chasing by hand.
  //
  // `actorId` is passed so a centre head claiming a lead for themselves
  // is not sent a message about their own click — notify() drops the
  // actor from its own recipient list.
  const { data: assigned } = await supabase
    .from("leads")
    .select("student_name, lead_number, lead_source")
    .eq("id", leadId)
    .maybeSingle<{ student_name: string; lead_number: number; lead_source: string | null }>();

  await notify({
    eventKey: "lead.assigned",
    context: {
      lead_name: assigned?.student_name ?? "A lead",
      lead_number: assigned?.lead_number ?? null,
      source: assigned?.lead_source ?? "the unassigned queue",
    },
    href: `/leads/${leadId}`,
    entityType: "leads",
    entityId: leadId,
    centerId: lead.center_id,
    ownerId: userId,
    actorId: user.id,
  });

  revalidatePath("/leads/orphans");
  revalidatePath("/leads");
  return {};
}
