"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { resolveAudience, type AudienceEntity, type AudienceSpec } from "@/lib/whatsapp/audience";
import { createClient } from "@/lib/supabase/server";

export interface BroadcastFormState {
  error?: string;
}

function isEntity(value: unknown): value is AudienceEntity {
  return value === "lead" || value === "student";
}

/** Parses the filter map the form carries as JSON, tolerating a blank or malformed value rather than failing the send. */
function parseFilters(raw: FormDataEntryValue | null): Record<string, string> {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
        .map(([key, value]) => [key, String(value)]),
    );
  } catch {
    return {};
  }
}

function specFrom(formData: FormData): AudienceSpec | null {
  const entity = formData.get("entity");
  if (!isEntity(entity)) return null;
  const tagId = formData.get("tagId");
  return {
    entity,
    filters: parseFilters(formData.get("filters")),
    tagId: typeof tagId === "string" && tagId ? tagId : null,
  };
}

export interface AudiencePreview {
  count: number;
  noPhone: number;
  doNotContact: number;
  duplicatePhone: number;
  /** A few names, so somebody can sanity-check that the filters mean what they think. */
  sample: string[];
  error?: string;
}

/**
 * How many people the current filters actually reach, before anything is
 * sent. A broadcast is irreversible and costs money per message, so
 * "you are about to message 412 people" belongs on the screen while the
 * filters are still being edited.
 */
export async function previewAudience(formData: FormData): Promise<AudiencePreview> {
  const empty = { count: 0, noPhone: 0, doNotContact: 0, duplicatePhone: 0, sample: [] };

  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) {
    return { ...empty, error: "You don't have permission to do that." };
  }

  const spec = specFrom(formData);
  if (!spec) return { ...empty, error: "Pick who this is going to." };

  const supabase = await createClient();
  try {
    const { members, skipped } = await resolveAudience(supabase, user, spec);
    return {
      count: members.length,
      noPhone: skipped.noPhone,
      doNotContact: skipped.doNotContact,
      duplicatePhone: skipped.duplicatePhone,
      sample: members.slice(0, 5).map((member) => member.name),
    };
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : "Could not work out the audience." };
  }
}

/**
 * Snapshots the recipient list at creation time (see the
 * whatsapp-broadcasts schema comment): the audience is resolved once,
 * here, and never recomputed, so somebody whose stage changes mid-send
 * doesn't change who the broadcast reaches.
 *
 * `do_not_contact` leads are excluded inside resolveAudience() — a
 * broadcast is exactly the unsolicited outbound contact that flag exists
 * to block. `consent_status`/`opted_out_channels` still aren't checked;
 * those govern ad-platform retargeting, a different consent question,
 * flagged in docs/DECISIONS.md as worth revisiting once WhatsApp-specific
 * consent tracking exists.
 */
export async function createBroadcast(
  _prevState: BroadcastFormState,
  formData: FormData,
): Promise<BroadcastFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) {
    return { error: "You don't have permission to do that." };
  }

  const name = formData.get("name");
  const templateName = formData.get("templateName");
  const templateLanguage = formData.get("templateLanguage");
  const bodyParam = formData.get("bodyParam");

  if (typeof name !== "string" || !name.trim()) return { error: "Name is required." };
  if (typeof templateName !== "string" || !templateName.trim()) {
    return { error: "Choose an approved template." };
  }

  const spec = specFrom(formData);
  if (!spec) return { error: "Pick who this is going to." };

  const supabase = await createClient();

  let audience;
  try {
    audience = await resolveAudience(supabase, user, spec);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not work out the audience." };
  }
  if (audience.members.length === 0) {
    return { error: "Nobody matches those filters — nothing would be sent." };
  }

  const { data: broadcast, error: insertError } = await supabase
    .from("whatsapp_broadcasts")
    .insert({
      name: name.trim(),
      audience_entity: spec.entity,
      audience_filters: spec.filters,
      tag_id: spec.tagId,
      template_name: templateName.trim(),
      template_language:
        typeof templateLanguage === "string" && templateLanguage.trim()
          ? templateLanguage.trim()
          : "en_US",
      body_param: typeof bodyParam === "string" && bodyParam.trim() ? bodyParam.trim() : null,
      status: "sending",
      created_by: user.id,
      total_recipients: audience.members.length,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError || !broadcast) {
    return { error: `Could not create the broadcast: ${insertError?.message ?? "unknown error"}` };
  }

  const { error: recipientsError } = await supabase.from("whatsapp_broadcast_recipients").insert(
    audience.members.map((member) => ({
      broadcast_id: broadcast.id,
      lead_id: member.entity === "lead" ? member.id : null,
      student_id: member.entity === "student" ? member.id : null,
      phone: member.phone,
    })),
  );
  if (recipientsError) {
    return { error: `Broadcast created but recipients failed to queue: ${recipientsError.message}` };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "whatsapp.broadcast_create",
    entityType: "whatsapp_broadcasts",
    entityId: broadcast.id,
    after: {
      name: name.trim(),
      entity: spec.entity,
      filters: spec.filters,
      tagId: spec.tagId,
      templateName: templateName.trim(),
      recipients: audience.members.length,
    },
  });

  revalidatePath("/whatsapp/broadcasts");
  redirect("/whatsapp/broadcasts");
}
