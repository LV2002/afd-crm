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
  /** Set once the bytes have been fetched from Meta into our own bucket. */
  mediaStoragePath: string | null;
  mediaFilename: string | null;
  /** Why the fetch failed, when it did — better on screen than a blank space. */
  mediaError: string | null;
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
  media_storage_path: string | null;
  media_filename: string | null;
  media_error: string | null;
  status: "queued" | "sent" | "delivered" | "read" | "failed" | "received";
  error_message: string | null;
  occurred_at: string;
}

/** RLS (`whatsapp_messages_select`, `whatsapp.read` scoped) does the actual visibility enforcement — an empty result for a lead this user can't see is indistinguishable from "no messages yet," which is the correct behaviour for a panel embedded on a page RLS already gated access to. */
export async function getWhatsAppThread(supabase: SupabaseClient, leadId: string): Promise<WhatsAppThreadMessage[]> {
  const { data } = await supabase
    .from("whatsapp_messages")
    .select("id, direction, message_type, body, template_name, media_id, media_mime_type, media_storage_path, media_filename, media_error, status, error_message, occurred_at")
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
    mediaStoragePath: row.media_storage_path,
    mediaFilename: row.media_filename,
    mediaError: row.media_error,
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
    .select("id, direction, message_type, body, template_name, media_id, media_mime_type, media_storage_path, media_filename, media_error, status, error_message, occurred_at")
    .is("lead_id", null)
    .eq("from_phone", phone)
    .is("deleted_at", null)
    .order("occurred_at", { ascending: true })
    .returns<MessageRow[]>();

  return (data ?? []).map(toThreadMessage);
}

const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Meta's rule, expressed once: a free-form reply is accepted only within
 * 24 hours of the other person's last message. Pure, so the boundary can
 * be tested without a database and without waiting a day.
 *
 * Null means they have never written to us, which is not the same as the
 * window having closed but has the same answer — no free-form send.
 */
export function isWithinWindow(lastInboundAt: string | Date | null, now = new Date()): boolean {
  if (lastInboundAt === null) return false;
  const at = lastInboundAt instanceof Date ? lastInboundAt : new Date(lastInboundAt);
  if (Number.isNaN(at.getTime())) return false;
  return now.getTime() - at.getTime() < WINDOW_MS;
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

  return isWithinWindow(data?.occurred_at ?? null);
}

/**
 * The same question for a thread that has no lead.
 *
 * Keyed on the contact's number and `lead_id is null`, which is exactly
 * how the unmatched thread itself is assembled — so the window the
 * composer is told about is the window of the messages on screen. Once a
 * thread is converted its rows carry a lead and the function above is
 * the one that applies.
 */
export async function isWithinCustomerServiceWindowForPhone(
  supabase: SupabaseClient,
  phone: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("whatsapp_messages")
    .select("occurred_at")
    .is("lead_id", null)
    .eq("from_phone", phone)
    .eq("direction", "inbound")
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ occurred_at: string }>();

  return isWithinWindow(data?.occurred_at ?? null);
}
