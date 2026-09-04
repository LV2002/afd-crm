"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { getIntegrationCredential } from "@/lib/integrations/credentials";
import {
  sendMediaMessage,
  sendTemplateMessage,
  sendTextMessage,
  uploadMedia,
} from "@/lib/integrations/whatsapp/client";
import { MetaGraphApiError } from "@/lib/integrations/meta/graph-client";
import { createClient } from "@/lib/supabase/server";
import { isWithinCustomerServiceWindow } from "@/lib/whatsapp/get-thread";
import { mediaKindFor, trimCaption, validateWhatsAppMedia } from "@/lib/whatsapp/media";

export interface WhatsAppSendState {
  error?: string;
  success?: string;
}

/**
 * Two-step write under RLS (see migration 0026's own comment): insert a
 * 'queued' row first — this is also where `whatsapp_messages_insert`
 * actually enforces "can this user send on this lead" — then call the
 * Cloud API, then update that same row with the real `wa_message_id` and
 * final status. A Cloud API failure still leaves a real 'failed' row on
 * the thread, not a silently lost send attempt.
 */
async function recordAndSend(
  leadId: string,
  toPhone: string,
  insertFields: {
    messageType: "text" | "template" | "media";
    body: string | null;
    templateName: string | null;
    mediaId?: string | null;
    mediaMimeType?: string | null;
  },
  send: (phoneNumberId: string, accessToken: string) => Promise<string>,
): Promise<WhatsAppSendState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.send")) {
    return { error: "You don't have permission to do that." };
  }

  // One number for the whole institute, not one per counsellor. A number
  // registered to the Cloud API can no longer be used in the WhatsApp
  // Business app, and AFD's counsellors keep those apps on their own
  // phones — so the CRM owns exactly one number, and who sent what is
  // recorded here rather than implied by which number it left from.
  const phoneNumberId = await getIntegrationCredential("whatsapp", "phone_number_id");
  const accessToken = await getIntegrationCredential("whatsapp", "access_token");
  if (!phoneNumberId || !accessToken) {
    return { error: "WhatsApp isn't connected yet — an admin sets it up in Settings → Integrations → WhatsApp." };
  }

  const supabase = await createClient();
  const { data: inserted, error: insertError } = await supabase
    .from("whatsapp_messages")
    .insert({
      lead_id: leadId,
      counsellor_id: user.id,
      sent_by: user.id,
      direction: "outbound",
      from_phone: phoneNumberId,
      to_phone: toPhone,
      message_type: insertFields.messageType,
      body: insertFields.body,
      template_name: insertFields.templateName,
      media_id: insertFields.mediaId ?? null,
      media_mime_type: insertFields.mediaMimeType ?? null,
      status: "queued",
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError || !inserted) {
    return { error: "You don't have access to message this lead." };
  }

  try {
    const waMessageId = await send(phoneNumberId, accessToken);
    await supabase.from("whatsapp_messages").update({ wa_message_id: waMessageId, status: "sent" }).eq("id", inserted.id);
  } catch (err) {
    const message = err instanceof MetaGraphApiError ? err.message : "Could not reach WhatsApp.";
    await supabase.from("whatsapp_messages").update({ status: "failed", error_message: message }).eq("id", inserted.id);
    return { error: `Send failed: ${message}` };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "whatsapp.message_send",
    entityType: "leads",
    entityId: leadId,
    after: { messageType: insertFields.messageType, templateName: insertFields.templateName },
  });

  revalidatePath(`/leads/${leadId}`);
  return { success: "Sent." };
}

/** Free-form text — only accepted by the Cloud API within Meta's 24-hour customer service window (the lead's last inbound message). */
export async function sendWhatsAppMessage(leadId: string, toPhone: string, body: string): Promise<WhatsAppSendState> {
  if (!body.trim()) return { error: "Message can't be empty." };

  const supabase = await createClient();
  const withinWindow = await isWithinCustomerServiceWindow(supabase, leadId);
  if (!withinWindow) {
    // Meta only accepts a free-form reply inside the 24-hour window the
    // lead's own message opens. Outside it the only API route is a paid
    // template, which is deliberately not a counsellor's decision (see
    // sendWhatsAppTemplate) — so the honest instruction is the one Leon
    // gave: message them from your own phone.
    return {
      error:
        "This lead hasn't messaged in the last 24 hours, so WhatsApp won't accept a reply from here. Message them from the WhatsApp Business app on your phone — the window reopens as soon as they write back.",
    };
  }

  return recordAndSend(leadId, toPhone, { messageType: "text", body: body.trim(), templateName: null }, (phoneNumberId, accessToken) =>
    sendTextMessage(phoneNumberId, accessToken, toPhone, body.trim()),
  );
}

/**
 * A pre-approved WhatsApp template — the only message type Meta accepts
 * outside the 24-hour window.
 *
 * Gated on `whatsapp.campaign`, not `whatsapp.send`. Leon's rule: a
 * counsellor whose window has closed uses their own phone, and template
 * sends stay with whoever is allowed to broadcast. That is not
 * bureaucracy — every template send is billed and counts against the
 * number's quality rating, and one number now carries the whole
 * institute's reputation.
 */
export async function sendWhatsAppTemplate(
  leadId: string,
  toPhone: string,
  templateName: string,
  languageCode: string,
  bodyParam: string,
): Promise<WhatsAppSendState> {
  const sender = await getCurrentUser();
  if (!sender || !can(sender, "whatsapp.campaign")) {
    return {
      error:
        "Template messages are sent by whoever runs WhatsApp campaigns. Message this lead from the WhatsApp Business app on your phone instead.",
    };
  }
  if (!templateName.trim()) return { error: "Template name is required." };

  return recordAndSend(leadId, toPhone, { messageType: "template", body: null, templateName: templateName.trim() }, (phoneNumberId, accessToken) =>
    sendTemplateMessage(phoneNumberId, accessToken, toPhone, templateName.trim(), languageCode.trim() || "en_US", bodyParam.trim() ? [bodyParam.trim()] : undefined),
  );
}

/**
 * An image, video or PDF, sent into an open conversation.
 *
 * Same 24-hour rule as a text message, for the same reason: Meta accepts
 * free-form content only inside the window the lead's own message opens.
 * Outside it, a media message needs a template with an approved media
 * header, which is a broadcast decision rather than a counsellor's — see
 * sendWhatsAppTemplate.
 *
 * The bytes go straight to Meta and are NOT written to the CRM's own
 * bucket. A photo of a fee receipt or a campus video sent in conversation
 * is not a document of record; storing every one of them would fill
 * private storage with things nobody will ever open again, and the lead's
 * Files section is now deliberately about one document only. What is kept
 * is the fact of the send: the row, its media id, and its type.
 */
export async function sendWhatsAppMedia(
  leadId: string,
  toPhone: string,
  formData: FormData,
): Promise<WhatsAppSendState> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose a file to send." };

  const invalid = validateWhatsAppMedia(file);
  if (invalid) return { error: invalid };

  const kind = mediaKindFor(file.type);
  // validateWhatsAppMedia has already rejected an unknown type; this is
  // the type system catching up rather than a second check.
  if (!kind) return { error: "WhatsApp cannot send that kind of file." };

  const captionRaw = formData.get("caption");
  const caption = typeof captionRaw === "string" ? trimCaption(captionRaw) : "";

  const supabase = await createClient();
  const withinWindow = await isWithinCustomerServiceWindow(supabase, leadId);
  if (!withinWindow) {
    return {
      error:
        "This lead hasn't messaged in the last 24 hours, so WhatsApp won't accept a file from here. Send it from the WhatsApp Business app on your phone — the window reopens as soon as they write back.",
    };
  }

  // Uploaded before the row is written so a rejected file never produces a
  // 'failed' message on the thread: a 12 MB photo is the user's mistake to
  // fix, not an event in the conversation.
  const phoneNumberId = await getIntegrationCredential("whatsapp", "phone_number_id");
  const accessToken = await getIntegrationCredential("whatsapp", "access_token");
  if (!phoneNumberId || !accessToken) {
    return { error: "WhatsApp isn't connected yet — an admin sets it up in Settings → Integrations → WhatsApp." };
  }

  let mediaId: string;
  try {
    mediaId = await uploadMedia(phoneNumberId, accessToken, file, file.name);
  } catch (err) {
    const message = err instanceof MetaGraphApiError ? err.message : "Could not reach WhatsApp.";
    return { error: `Upload failed: ${message}` };
  }

  return recordAndSend(
    leadId,
    toPhone,
    {
      messageType: "media",
      // The caption is the message's readable content, so it goes in the
      // body — that is what the thread renders and what a later search
      // over the conversation would find.
      body: caption || null,
      templateName: null,
      mediaId,
      mediaMimeType: file.type,
    },
    (id, token) =>
      sendMediaMessage(id, token, toPhone, {
        kind,
        mediaId,
        caption: caption || undefined,
        fileName: file.name,
      }),
  );
}
