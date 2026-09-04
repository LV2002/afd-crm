import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The WhatsApp inbox: one row per lead somebody has exchanged messages
 * with, newest activity first.
 *
 * Who sees which threads is not decided here. `whatsapp_messages` RLS
 * (`whatsapp.read`, own/center/all) already scopes every row to the
 * caller through its lead, so a counsellor's inbox is their own leads and
 * a centre head's is their centre's — the same boundary as the leads
 * list, enforced in the same place. There is no "whose inbox" switch to
 * get wrong.
 *
 * Threads are assembled from the message rows rather than stored: a
 * `whatsapp_threads` table would be a second source of truth for "what
 * was the last message", and the only thing it would buy at AFD's volume
 * is a join.
 */

/** How many recent messages to scan when assembling the list. Well past a year of AFD's traffic; the newest thread is never off the end. */
const MESSAGE_SCAN_LIMIT = 3000;

export interface WhatsAppThreadSummary {
  /** Stable id for the thread — a lead id, or the contact's number when nobody in the CRM has it. */
  key: string;
  /** Null when the reply came from a number that isn't a lead yet. */
  leadId: string | null;
  /** The lead's name, or the bare number when there is no lead. */
  leadName: string;
  /** E.164, as stored. */
  phone: string;
  assignedTo: string | null;
  counsellorName: string | null;
  lastMessageAt: string;
  lastDirection: "inbound" | "outbound";
  /** Already flattened for display: a media or template message has no body of its own. */
  lastMessagePreview: string;
  /** The lead wrote last, so somebody owes them a reply. */
  awaitingReply: boolean;
  messageCount: number;
}

interface MessageRow {
  lead_id: string | null;
  from_phone: string;
  direction: "inbound" | "outbound";
  message_type: "text" | "template" | "media";
  body: string | null;
  template_name: string | null;
  media_mime_type: string | null;
  occurred_at: string;
}

function preview(row: MessageRow): string {
  if (row.message_type === "media") {
    return `${row.media_mime_type?.split("/")[0] ?? "Media"} attachment`;
  }
  if (row.message_type === "template") return `Template: ${row.template_name ?? "sent"}`;
  return (row.body ?? "").replace(/\s+/g, " ").trim() || "(empty message)";
}

export async function getWhatsAppThreads(
  supabase: SupabaseClient,
): Promise<WhatsAppThreadSummary[]> {
  const { data: messageRows } = await supabase
    .from("whatsapp_messages")
    .select("lead_id, from_phone, direction, message_type, body, template_name, media_mime_type, occurred_at")
    .is("deleted_at", null)
    .order("occurred_at", { ascending: false })
    .limit(MESSAGE_SCAN_LIMIT)
    .returns<MessageRow[]>();

  const messages = messageRows ?? [];
  if (messages.length === 0) return [];

  // A thread is keyed by the lead when there is one, and by the contact's
  // own number when there isn't — a reply from somebody nobody has
  // entered yet is still one conversation, and losing it would be losing
  // the only record that they answered.
  const threadKey = (row: MessageRow): string =>
    row.lead_id ? `lead:${row.lead_id}` : `phone:${row.from_phone}`;

  // Rows arrive newest first, so the first one seen for a thread is its
  // latest message and everything after it is history.
  const latest = new Map<string, MessageRow>();
  const counts = new Map<string, number>();
  for (const row of messages) {
    const key = threadKey(row);
    if (!latest.has(key)) latest.set(key, row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const leadIds = Array.from(
    new Set(messages.map((row) => row.lead_id).filter((id): id is string => id !== null)),
  );
  const { data: leadRows } =
    leadIds.length > 0
      ? await supabase
          .from("leads")
          .select("id, student_name, primary_phone, assigned_to")
          .in("id", leadIds)
          .is("deleted_at", null)
          .returns<
            Array<{
              id: string;
              student_name: string;
              primary_phone: string;
              assigned_to: string | null;
            }>
          >()
      : { data: [] };

  const leadById = new Map((leadRows ?? []).map((lead) => [lead.id, lead]));

  // `profiles` is only readable to whoever holds users.manage, so a
  // counsellor gets their own name and nothing else. That is fine: their
  // inbox is their own threads anyway, and a missing name renders as a
  // dash rather than as a uuid.
  const ownerIds = Array.from(
    new Set((leadRows ?? []).map((lead) => lead.assigned_to).filter((id): id is string => !!id)),
  );
  const nameById = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ownerIds)
      .returns<Array<{ id: string; full_name: string }>>();
    for (const profile of profileRows ?? []) nameById.set(profile.id, profile.full_name);
  }

  return Array.from(latest.entries())
    .map(([key, message]): WhatsAppThreadSummary | null => {
      const lead = message.lead_id ? leadById.get(message.lead_id) : undefined;
      // A message whose lead is soft-deleted simply isn't a thread any
      // more; an unmatched one has no lead by design and stays.
      if (message.lead_id && !lead) return null;
      return {
        key,
        leadId: lead?.id ?? null,
        leadName: lead?.student_name ?? message.from_phone,
        phone: lead?.primary_phone ?? message.from_phone,
        assignedTo: lead?.assigned_to ?? null,
        counsellorName: lead?.assigned_to ? (nameById.get(lead.assigned_to) ?? null) : null,
        lastMessageAt: message.occurred_at,
        lastDirection: message.direction,
        lastMessagePreview: preview(message),
        awaitingReply: message.direction === "inbound",
        messageCount: counts.get(key) ?? 0,
      };
    })
    .filter((thread): thread is WhatsAppThreadSummary => thread !== null)
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}
