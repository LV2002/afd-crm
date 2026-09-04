"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { getIntegrationCredential } from "@/lib/integrations/credentials";
import { sendTemplateMessage, sendTextMessage } from "@/lib/integrations/whatsapp/client";
import { MetaGraphApiError } from "@/lib/integrations/meta/graph-client";
import { createClient } from "@/lib/supabase/server";
import { isWithinCustomerServiceWindow } from "@/lib/whatsapp/get-thread";

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
  insertFields: { messageType: "text" | "template"; body: string | null; templateName: string | null },
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
