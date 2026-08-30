"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export interface BroadcastFormState {
  error?: string;
}

interface TaggedLeadRow {
  lead_id: string;
  leads: { primary_phone: string } | null;
}

/**
 * Snapshots the recipient list at creation time (see whatsapp-broadcasts.ts
 * schema comment) — excludes `do_not_contact` leads the same way the
 * retargeting sync excludes them, since a broadcast is exactly the kind of
 * unsolicited outbound contact that flag exists to block. Does not check
 * `consent_status`/`opted_out_channels` (those govern ad-platform
 * retargeting specifically, a different consent question) — flagged in
 * docs/DECISIONS.md as worth revisiting once WhatsApp-specific consent
 * tracking exists.
 */
export async function createBroadcast(_prevState: BroadcastFormState, formData: FormData): Promise<BroadcastFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) {
    return { error: "You don't have permission to do that." };
  }

  const name = formData.get("name");
  const tagId = formData.get("tagId");
  const templateName = formData.get("templateName");
  const templateLanguage = formData.get("templateLanguage");
  const bodyParam = formData.get("bodyParam");

  if (typeof name !== "string" || !name.trim()) return { error: "Name is required." };
  if (typeof tagId !== "string" || !tagId) return { error: "Choose a tag to target." };
  if (typeof templateName !== "string" || !templateName.trim()) return { error: "Template name is required." };

  const supabase = await createClient();

  const { data: taggedLeads, error: leadsError } = await supabase
    .from("lead_tags")
    .select("lead_id, leads!inner(primary_phone)")
    .eq("tag_id", tagId)
    .eq("leads.do_not_contact", false)
    .is("leads.deleted_at", null)
    .returns<TaggedLeadRow[]>();

  if (leadsError) {
    return { error: `Could not load the tagged leads: ${leadsError.message}` };
  }
  if (!taggedLeads || taggedLeads.length === 0) {
    return { error: "No contactable leads carry that tag." };
  }

  const { data: broadcast, error: insertError } = await supabase
    .from("whatsapp_broadcasts")
    .insert({
      name: name.trim(),
      tag_id: tagId,
      template_name: templateName.trim(),
      template_language: typeof templateLanguage === "string" && templateLanguage.trim() ? templateLanguage.trim() : "en_US",
      body_param: typeof bodyParam === "string" && bodyParam.trim() ? bodyParam.trim() : null,
      status: "sending",
      created_by: user.id,
      total_recipients: taggedLeads.length,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError || !broadcast) {
    return { error: `Could not create the broadcast: ${insertError?.message ?? "unknown error"}` };
  }

  const { error: recipientsError } = await supabase.from("whatsapp_broadcast_recipients").insert(
    taggedLeads
      .filter((row) => row.leads?.primary_phone)
      .map((row) => ({ broadcast_id: broadcast.id, lead_id: row.lead_id, phone: row.leads!.primary_phone })),
  );
  if (recipientsError) {
    return { error: `Broadcast created but recipients failed to queue: ${recipientsError.message}` };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "whatsapp.broadcast_create",
    entityType: "whatsapp_broadcasts",
    entityId: broadcast.id,
    after: { name: name.trim(), tagId, templateName: templateName.trim(), recipients: taggedLeads.length },
  });

  revalidatePath("/settings/whatsapp-broadcasts");
  redirect("/settings/whatsapp-broadcasts");
}
