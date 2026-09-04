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
  leadId: string;
  leadName: string;
  /** E.164. The caller masks it — this is a bulk list (CLAUDE.md non-negotiable #6). */
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
  lead_id: string;
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
    .select("lead_id, direction, message_type, body, template_name, media_mime_type, occurred_at")
    .is("deleted_at", null)
    .order("occurred_at", { ascending: false })
    .limit(MESSAGE_SCAN_LIMIT)
    .returns<MessageRow[]>();

  const messages = messageRows ?? [];
  if (messages.length === 0) return [];

  // Rows arrive newest first, so the first one seen for a lead is that
  // thread's latest message and everything after it is history.
  const latest = new Map<string, MessageRow>();
  const counts = new Map<string, number>();
  for (const row of messages) {
    if (!latest.has(row.lead_id)) latest.set(row.lead_id, row);
    counts.set(row.lead_id, (counts.get(row.lead_id) ?? 0) + 1);
  }

  const leadIds = Array.from(latest.keys());
  const { data: leadRows } = await supabase
    .from("leads")
    .select("id, student_name, primary_phone, assigned_to")
    .in("id", leadIds)
    .is("deleted_at", null)
    .returns<
      Array<{ id: string; student_name: string; primary_phone: string; assigned_to: string | null }>
    >();

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

  return leadIds
    .map((leadId): WhatsAppThreadSummary | null => {
      const lead = leadById.get(leadId);
      const message = latest.get(leadId);
      // A message whose lead is soft-deleted or outside this caller's
      // scope simply isn't a thread they have.
      if (!lead || !message) return null;
      return {
        leadId,
        leadName: lead.student_name,
        phone: lead.primary_phone,
        assignedTo: lead.assigned_to,
        counsellorName: lead.assigned_to ? (nameById.get(lead.assigned_to) ?? null) : null,
        lastMessageAt: message.occurred_at,
        lastDirection: message.direction,
        lastMessagePreview: preview(message),
        awaitingReply: message.direction === "inbound",
        messageCount: counts.get(leadId) ?? 0,
      };
    })
    .filter((thread): thread is WhatsAppThreadSummary => thread !== null)
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}
