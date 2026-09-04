import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export interface WhatsAppThreadMessage {
  id: string;
  direction: "inbound" | "outbound";
  messageType: "text" | "template" | "media";
  body: string | null;
  templateName: string | null;
  mediaId: string | null;
  mediaMimeType: string | null;
  status: "queued" | "sent" | "delivered" | "read" | "failed" | "received";
  errorMessage: string | null;
  occurredAt: string;
}

interface MessageRow {
  id: string;
  direction: "inbound" | "outbound";
  message_type: "text" | "template" | "media";
  body: string | null;
  template_name: string | null;
  media_id: string | null;
  media_mime_type: string | null;
  status: "queued" | "sent" | "delivered" | "read" | "failed" | "received";
  error_message: string | null;
  occurred_at: string;
}

/** RLS (`whatsapp_messages_select`, `whatsapp.read` scoped) does the actual visibility enforcement — an empty result for a lead this user can't see is indistinguishable from "no messages yet," which is the correct behaviour for a panel embedded on a page RLS already gated access to. */
export async function getWhatsAppThread(supabase: SupabaseClient, leadId: string): Promise<WhatsAppThreadMessage[]> {
  const { data } = await supabase
    .from("whatsapp_messages")
    .select("id, direction, message_type, body, template_name, media_id, media_mime_type, status, error_message, occurred_at")
    .eq("lead_id", leadId)
    .is("deleted_at", null)
    .order("occurred_at", { ascending: true })
    .returns<MessageRow[]>();

  return (data ?? []).map(toThreadMessage);
}

function toThreadMessage(row: MessageRow): WhatsAppThreadMessage {
  return {
    id: row.id,
    direction: row.direction,
    messageType: row.message_type,
    body: row.body,
    templateName: row.template_name,
    mediaId: row.media_id,
    mediaMimeType: row.media_mime_type,
    status: row.status,
    errorMessage: row.error_message,
    occurredAt: row.occurred_at,
  };
}

/**
 * The same thread, for a reply that matched no lead.
 *
 * Keyed by the contact's number because there is nothing else to key it
 * by: this number sends the institute's marketing and AFD's enquiries
 * arrive elsewhere, so somebody who replies without being in the CRM is
 * a real conversation with no record attached. Readable only by whoever
 * runs campaigns — see migration 0042; RLS, not this function, is what
 * enforces that.
 */
export async function getWhatsAppThreadByPhone(
  supabase: SupabaseClient,
  phone: string,
): Promise<WhatsAppThreadMessage[]> {
  const { data } = await supabase
    .from("whatsapp_messages")
    .select("id, direction, message_type, body, template_name, media_id, media_mime_type, status, error_message, occurred_at")
    .is("lead_id", null)
    .eq("from_phone", phone)
    .is("deleted_at", null)
    .order("occurred_at", { ascending: true })
    .returns<MessageRow[]>();

  return (data ?? []).map(toThreadMessage);
}

/** Whether a free-form text reply is currently allowed — Meta's 24-hour customer service window, opened by the lead's most recent inbound message. Outside it, only a template send is accepted by the Cloud API. */
export async function isWithinCustomerServiceWindow(supabase: SupabaseClient, leadId: string): Promise<boolean> {
  const { data } = await supabase
    .from("whatsapp_messages")
    .select("occurred_at")
    .eq("lead_id", leadId)
    .eq("direction", "inbound")
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ occurred_at: string }>();

  if (!data) return false;
  return Date.now() - new Date(data.occurred_at).getTime() < 24 * 60 * 60 * 1000;
}
