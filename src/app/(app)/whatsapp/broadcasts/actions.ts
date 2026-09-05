"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { getIntegrationCredential } from "@/lib/integrations/credentials";
import { MetaGraphApiError } from "@/lib/integrations/meta/graph-client";
import { uploadMedia } from "@/lib/integrations/whatsapp/client";
import { resolveAudience, type AudienceEntity, type AudienceSpec } from "@/lib/whatsapp/audience";
import { mediaKindFor, validateWhatsAppMedia } from "@/lib/whatsapp/media";
import { resolveMergeValues, type MergeValues } from "@/lib/whatsapp/merge-values";
import { isUsableVariable } from "@/lib/whatsapp/merge-variables";
import { parseParamSources, resolveParams, type ParamSource } from "@/lib/whatsapp/personalise";
import { parseScheduleAt } from "@/lib/whatsapp/schedule";
import { db } from "@/lib/db/client";
import { whatsappBroadcasts } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
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
  /**
   * The merge values of the FIRST person on the list, so the composer can
   * show the message as that one real person will read it. Names, not
   * numbers — the preview is a sentence, not a contact export.
   */
  sampleValues?: MergeValues;
  error?: string;
}

/** The variable keys the composer is currently using, so a preview resolves those and nothing else. */
function requestedKeys(formData: FormData): string[] {
  const sources = parseParamSources(safeJson(formData.get("bodyParams")));
  return [
    ...new Set(sources.flatMap((source) => (source.kind === "variable" ? [source.key] : []))),
  ];
}

function safeJson(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Reads the per-placeholder sources, refusing any variable this system
 * cannot actually fill for this audience.
 *
 * Checked on the way IN rather than only at send time: a key nobody can
 * resolve is not one odd word in one message, it is four hundred messages
 * that all say the fallback, and nobody notices until a customer replies
 * asking who "there" is.
 */
function readParamSources(
  formData: FormData,
  entity: AudienceEntity,
): { sources: ParamSource[] } | { error: string } {
  const sources = parseParamSources(safeJson(formData.get("bodyParams")));
  for (const [index, source] of sources.entries()) {
    if (source.kind === "text") {
      // A blank fixed value is a blank in every single message, and Meta
      // rejects an empty parameter — so this is the whole send failing,
      // said now rather than discovered in the failed count.
      if (!source.value.trim()) return { error: `Fill in the words for {{${index + 1}}}.` };
      continue;
    }
    if (!isUsableVariable(source.key, entity)) {
      return {
        error: `"${source.key}" isn't something this system can fill in for a ${entity}.`,
      };
    }
    if (!source.fallback.trim()) {
      return {
        error: `Give {{${index + 1}}} something to say for anybody we don't have that detail for.`,
      };
    }
  }
  return { sources };
}

/**
 * How many people the current filters actually reach, before anything is
 * sent. A broadcast is irreversible and costs money per message, so
 * "you are about to message 412 people" belongs on the screen while the
 * filters are still being edited.
 */
export async function previewAudience(formData: FormData): Promise<AudiencePreview> {
  const empty = {
    count: 0,
    noPhone: 0,
    doNotContact: 0,
    duplicatePhone: 0,
    sample: [],
  };

  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) {
    return { ...empty, error: "You don't have permission to do that." };
  }

  const spec = specFrom(formData);
  if (!spec) return { ...empty, error: "Pick who this is going to." };

  const supabase = await createClient();
  try {
    const { members, skipped } = await resolveAudience(supabase, user, spec);
    const keys = requestedKeys(formData);
    const first = members[0];
    const sampleValues =
      first && keys.length > 0
        ? (await resolveMergeValues(spec.entity, [first], keys)).get(first.id)
        : undefined;

    return {
      count: members.length,
      noPhone: skipped.noPhone,
      doNotContact: skipped.doNotContact,
      duplicatePhone: skipped.duplicatePhone,
      sample: members.slice(0, 5).map((member) => member.name),
      sampleValues,
    };
  } catch (err) {
    return {
      ...empty,
      error: err instanceof Error ? err.message : "Could not work out the audience.",
    };
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

  const parsedSources = readParamSources(formData, spec.entity);
  if ("error" in parsedSources) return parsedSources;
  const sources = parsedSources.sources;

  // Now, or later. A scheduled broadcast is written with its audience
  // already frozen and simply waits — see the sweep, which promotes it
  // once its moment has passed.
  const scheduleNow = formData.get("sendMode") !== "schedule";
  let scheduledFor: Date | null = null;
  if (!scheduleNow) {
    const parsed = parseScheduleAt(String(formData.get("scheduledAt") ?? ""), new Date());
    if (parsed.error || !parsed.at) return { error: parsed.error ?? "Pick a time." };
    scheduledFor = parsed.at;
  }

  const supabase = await createClient();

  let audience;
  try {
    audience = await resolveAudience(supabase, user, spec);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not work out the audience.",
    };
  }
  if (audience.members.length === 0) {
    return { error: "Nobody matches those filters — nothing would be sent." };
  }

  // The header image or video, if this template was approved with one.
  //
  // Uploaded ONCE, here, rather than per recipient: Meta's media id is
  // reusable for 30 days, so a campus video reaches four hundred people
  // having been pushed across the wire a single time. Doing it before the
  // broadcast row is written also means a rejected file leaves no
  // half-created campaign behind.
  let headerMedia: { id: string; kind: string; fileName: string } | null = null;
  const headerFile = formData.get("headerMedia");
  if (headerFile instanceof File && headerFile.size > 0) {
    const invalid = validateWhatsAppMedia(headerFile);
    if (invalid) return { error: invalid };

    const kind = mediaKindFor(headerFile.type);
    if (!kind) return { error: "WhatsApp cannot send that kind of file." };

    const phoneNumberId = await getIntegrationCredential("whatsapp", "phone_number_id");
    const accessToken = await getIntegrationCredential("whatsapp", "access_token");
    if (!phoneNumberId || !accessToken) {
      return {
        error:
          "WhatsApp isn't connected yet — an admin sets it up in Settings → Integrations → WhatsApp.",
      };
    }

    try {
      const mediaId = await uploadMedia(phoneNumberId, accessToken, headerFile, headerFile.name);
      headerMedia = { id: mediaId, kind, fileName: headerFile.name };
    } catch (err) {
      const message = err instanceof MetaGraphApiError ? err.message : "Could not reach WhatsApp.";
      return { error: `Could not upload the header image: ${message}` };
    }
  }

  // Each person's own words, resolved HERE rather than at send time.
  // Same reasoning as snapshotting the phone number: the send loop stays
  // one API call per person with no lookups, and "what did we actually
  // say to Anjali" stays readable months later instead of being
  // recomputed against a record that has since changed.
  const variableKeys = [
    ...new Set(sources.flatMap((source) => (source.kind === "variable" ? [source.key] : []))),
  ];
  let mergeValues = new Map<string, MergeValues>();
  if (variableKeys.length > 0) {
    try {
      mergeValues = await resolveMergeValues(spec.entity, audience.members, variableKeys);
    } catch (err) {
      return {
        error: `Could not work out the personalised values: ${err instanceof Error ? err.message : "unknown error"}`,
      };
    }
  }

  const recipients = audience.members.map((member) => {
    const { params, missing } = resolveParams(sources, mergeValues.get(member.id) ?? {});
    return { member, params, missing };
  });

  // A placeholder that resolved to nothing AND has no fallback cannot be
  // sent: Meta rejects an empty parameter outright. That one person is
  // queued as already failed with a reason a human can read, rather than
  // discovered as an unexplained failure at 3am — and the rest of the
  // audience still goes.
  // With the checks above, every variable has a fallback and every fixed
  // value has words, so this should always be zero. It is still counted
  // rather than assumed — `resolveParams` is what actually decides, and a
  // fallback of "   " is not something anybody should have to think about.
  const preFailed = recipients.filter((row) => row.missing.length > 0).length;
  if (preFailed === audience.members.length) {
    return { error: "Nothing could be filled in for anybody — check the values above." };
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
      body_params: sources,
      header_media_id: headerMedia?.id ?? null,
      header_media_kind: headerMedia?.kind ?? null,
      header_media_filename: headerMedia?.fileName ?? null,
      status: scheduledFor ? "scheduled" : "sending",
      scheduled_for: scheduledFor?.toISOString() ?? null,
      created_by: user.id,
      total_recipients: audience.members.length,
      // Counted from the start so the progress line adds up: a recipient
      // that could never be sent is part of the total, not a silent gap.
      failed_count: preFailed,
      // Only a send that is happening now has started. A scheduled one
      // gets its `started_at` from the sweep when it actually begins.
      started_at: scheduledFor ? null : new Date().toISOString(),
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError || !broadcast) {
    return {
      error: `Could not create the broadcast: ${insertError?.message ?? "unknown error"}`,
    };
  }

  const { error: recipientsError } = await supabase.from("whatsapp_broadcast_recipients").insert(
    recipients.map(({ member, params, missing }) => ({
      broadcast_id: broadcast.id,
      lead_id: member.entity === "lead" ? member.id : null,
      student_id: member.entity === "student" ? member.id : null,
      phone: member.phone,
      params,
      status: missing.length > 0 ? "failed" : "queued",
      error_message:
        missing.length > 0
          ? `No value for ${missing.map((n) => `{{${n}}}`).join(", ")} and no fallback set.`
          : null,
    })),
  );
  if (recipientsError) {
    return {
      error: `Broadcast created but recipients failed to queue: ${recipientsError.message}`,
    };
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
      headerMedia: headerMedia?.fileName ?? null,
      recipients: audience.members.length,
      scheduledFor: scheduledFor?.toISOString() ?? null,
      personalised: sources.some((source) => source.kind === "variable"),
    },
  });

  revalidatePath("/whatsapp/broadcasts");
  redirect("/whatsapp/broadcasts");
}

/**
 * Stops a broadcast — one waiting for its scheduled time, or one already
 * part-way through going out.
 *
 * The whole reason scheduling needs this: composing on Monday for Tuesday
 * morning is only safe if Monday evening's "wrong list" can be undone.
 * Mid-send is allowed too, because the alternative when somebody spots a
 * mistake at message 40 of 400 is watching the other 360 leave.
 *
 * Cancelling is a status change and nothing else. The sweep only ever
 * picks up recipients whose broadcast is `sending`, so moving the row to
 * `cancelled` halts it at the next batch; the recipients who never got it
 * stay `queued` on purpose, as the record of who was spared.
 *
 * Runs on the direct client rather than through RLS. That is deliberate
 * and matches migration 0028's reasoning: these tables have no UPDATE
 * policy for authenticated roles at all, because send progress
 * (`sent_count`, `wa_message_id`, per-recipient status) is the cron's to
 * write and nobody should be able to hand-edit it. `whatsapp.campaign` is
 * an org-wide primitive with no centre dimension, so the check below is
 * the whole of the check.
 */
export async function cancelBroadcast(
  _prevState: BroadcastFormState,
  formData: FormData,
): Promise<BroadcastFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) {
    return { error: "You don't have permission to do that." };
  }

  const broadcastId = String(formData.get("broadcastId") ?? "").trim();
  if (!broadcastId) return { error: "Which broadcast?" };

  const [existing] = await db
    .select({
      id: whatsappBroadcasts.id,
      name: whatsappBroadcasts.name,
      status: whatsappBroadcasts.status,
      sentCount: whatsappBroadcasts.sentCount,
    })
    .from(whatsappBroadcasts)
    .where(eq(whatsappBroadcasts.id, broadcastId));

  if (!existing) return { error: "That broadcast no longer exists." };
  if (existing.status !== "scheduled" && existing.status !== "sending") {
    return {
      error: `This one is already ${existing.status} — there is nothing left to stop.`,
    };
  }

  // Guarded on the status we read, so two people pressing Cancel at once,
  // or a sweep completing it in between, cannot produce a cancelled
  // broadcast that had in fact already finished.
  const stopped = await db
    .update(whatsappBroadcasts)
    .set({ status: "cancelled", cancelledAt: new Date(), cancelledBy: user.id })
    .where(
      and(
        eq(whatsappBroadcasts.id, broadcastId),
        inArray(whatsappBroadcasts.status, ["scheduled", "sending"]),
      ),
    )
    .returning({ id: whatsappBroadcasts.id });

  if (stopped.length === 0) return { error: "That broadcast finished before it could be stopped." };

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "whatsapp.broadcast_cancel",
    entityType: "whatsapp_broadcasts",
    entityId: broadcastId,
    before: { status: existing.status },
    after: { status: "cancelled", alreadySent: existing.sentCount },
  });

  revalidatePath("/whatsapp/broadcasts");
  return {};
}
