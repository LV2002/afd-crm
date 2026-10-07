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
import { NO_SENDER_NUMBER_MESSAGE, senderNumberFor } from "@/lib/whatsapp/sender-number";
import {
  isWithinCustomerServiceWindow,
  isWithinCustomerServiceWindowForPhone,
} from "@/lib/whatsapp/get-thread";
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
 *
 * `leadId` is null for a reply to somebody who is not in the CRM.
 * Migration 0090 accepts those rows from whoever can already see the
 * thread; the `counsellor_id` written below is what that policy tests, so
 * it is the sender's own id and never anything a form supplied.
 */
async function recordAndSend(
  leadId: string | null,
  toPhone: string,
  /**
   * How this message leaves.
   *
   * `"own"` — from the sending counsellor's own Coexistence number, which
   * is every free-form reply. Leon's rule: a counsellor's message never
   * goes out on the institute's broadcast number.
   *
   * `"api"` — from the broadcast number, which is templates and
   * campaigns: the institute speaking rather than a person.
   */
  via: "own" | "api",
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

  /*
    Which number this leaves from.

    One WABA access token covers every number on the account; only the
    sending `phone_number_id` differs. So the whole decision is which id
    to use, and it is made from the session rather than from anything a
    form sent.
  */
  const accessToken = await getIntegrationCredential("whatsapp", "access_token");

  let numberId: string | null = null;
  let phoneNumberId: string | null;

  if (via === "own") {
    const sender = await senderNumberFor(user.id);
    if (!sender) return { error: NO_SENDER_NUMBER_MESSAGE };
    numberId = sender.id;
    phoneNumberId = sender.phoneNumberId;
  } else {
    phoneNumberId = await getIntegrationCredential("whatsapp", "phone_number_id");
  }

  if (!phoneNumberId || !accessToken) {
    return { error: "WhatsApp isn't connected yet — an admin sets it up in Settings → Integrations → WhatsApp." };
  }

  const supabase = await createClient();
  const { data: inserted, error: insertError } = await supabase
    .from("whatsapp_messages")
    .insert({
      lead_id: leadId,
      number_id: numberId,
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
    return {
      error: leadId
        ? "You don't have access to message this lead."
        : "You don't have access to reply to this conversation.",
    };
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
    // An unmatched reply is not about a lead, so it is logged against the
    // message itself rather than against a lead id that does not exist.
    // The number it went to is in `after`, which is the only handle
    // anybody has on that conversation until somebody converts it.
    entityType: leadId ? "leads" : "whatsapp_messages",
    entityId: leadId ?? inserted.id,
    after: {
      messageType: insertFields.messageType,
      templateName: insertFields.templateName,
      ...(leadId ? {} : { toPhone }),
    },
  });

  if (leadId) revalidatePath(`/leads/${leadId}`);
  revalidatePath("/whatsapp");
  return { success: "Sent." };
}

/**
 * Free-form text — only accepted by the Cloud API within Meta's 24-hour
 * customer service window, opened by their last inbound message.
 *
 * `leadId` null is a reply to somebody who is not in the CRM yet. The
 * window is then read off the unmatched thread rather than off a lead,
 * and it is the same 24 hours: Meta's rule is about the conversation, and
 * it does not care whether the CRM has decided this person is an enquiry.
 */
export async function sendWhatsAppMessage(
  leadId: string | null,
  toPhone: string,
  body: string,
): Promise<WhatsAppSendState> {
  if (!body.trim()) return { error: "Message can't be empty." };

  const user = await getCurrentUser();
  if (!user) return { error: "You don't have permission to do that." };

  /*
    The window is checked against the number this will actually leave
    from, which is the counsellor's own.

    Meta scopes the 24-hour window to a number pair. A student who
    messaged the institute's broadcast number has opened a window *there*
    and nowhere else — so a reply from the counsellor's handset is a
    first contact as far as Meta is concerned, and gets refused. Checking
    the looser "have they messaged us at all" would mean inviting
    somebody to type a reply that is then rejected, which is the one
    failure worth a query to avoid.
  */
  const sender = await senderNumberFor(user.id);
  if (!sender) return { error: NO_SENDER_NUMBER_MESSAGE };

  const supabase = await createClient();
  const withinWindow = leadId
    ? await isWithinCustomerServiceWindow(supabase, leadId, sender.id)
    : await isWithinCustomerServiceWindowForPhone(supabase, toPhone, sender.id);
  if (!withinWindow) {
    // Outside the window the only API route is a paid template, which is
    // deliberately not a counsellor's decision (see sendWhatsAppTemplate)
    // — so the honest instruction is the one Leon gave: use your phone.
    return {
      error: `${leadId ? "This lead hasn't" : "They haven't"} messaged ${sender.label} in the last 24 hours, so WhatsApp won't accept a reply from here. Message them from the WhatsApp Business app on your phone — the window reopens as soon as they write back.`,
    };
  }

  // "own": a counsellor's reply always leaves from their own number.
  return recordAndSend(leadId, toPhone, "own", { messageType: "text", body: body.trim(), templateName: null }, (phoneNumberId, accessToken) =>
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

  // "api": a template is the institute speaking, is billed to the
  // institute, and is gated on whatsapp.campaign above.
  return recordAndSend(leadId, toPhone, "api", { messageType: "template", body: null, templateName: templateName.trim() }, (phoneNumberId, accessToken) =>
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
    // A photo of a campus or a fee receipt is a counsellor sending
    // something, so it follows the same rule as the text beside it.
    "own",
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
