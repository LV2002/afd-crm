import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isWithinInstagramReplyWindow } from "./reply-window";

/**
 * The Instagram inbox list, and the one thread behind it.
 *
 * Read through the caller's own client, never the service role: which
 * conversations somebody sees is decided by `instagram_conversations`'
 * RLS (migration 0081) — a converted conversation inherits its lead's
 * centre scoping, an unconverted one is visible to anybody who works the
 * inbox, because a DM is addressed to the institute rather than to a
 * counsellor and somebody has to answer it.
 */

export interface InstagramConversationRow {
  id: string;
  igUserId: string;
  username: string | null;
  name: string | null;
  profilePicUrl: string | null;
  leadId: string | null;
  leadName: string | null;
  assignedTo: string | null;
  counsellorName: string | null;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  unreadCount: number;
  lastMessagePreview: string;
  lastDirection: "inbound" | "outbound" | null;
  messageCount: number;
  /** They wrote last, and the 24-hour reply window is still open. */
  awaitingReply: boolean;
}

interface RawConversation {
  id: string;
  ig_user_id: string;
  username: string | null;
  name: string | null;
  profile_pic_url: string | null;
  lead_id: string | null;
  assigned_to: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  unread_count: number;
  leads: { student_name: string } | null;
  profiles: { full_name: string } | null;
  instagram_messages: Array<{
    body: string | null;
    direction: "inbound" | "outbound";
    attachment_type: string | null;
    sent_at: string;
  }>;
}

/** A one-line preview, with an attachment described rather than shown as empty. */
function preview(message: RawConversation["instagram_messages"][number] | undefined): string {
  if (!message) return "";
  if (message.body) return message.body;
  if (message.attachment_type) return `[${message.attachment_type}]`;
  return "(no text)";
}

export async function getInstagramConversations(
  supabase: SupabaseClient,
  limit = 100,
): Promise<InstagramConversationRow[]> {
  // The messages are embedded rather than fetched per thread: a hundred
  // threads would otherwise be a hundred queries for the sake of one
  // preview line each.
  const { data } = await supabase
    .from("instagram_conversations")
    .select(
      `id, ig_user_id, username, name, profile_pic_url, lead_id, assigned_to,
       last_message_at, last_inbound_at, unread_count,
       leads ( student_name ),
       profiles ( full_name ),
       instagram_messages ( body, direction, attachment_type, sent_at )`,
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit)
    .returns<RawConversation[]>();

  const now = new Date();

  return (data ?? []).map((row) => {
    const messages = [...(row.instagram_messages ?? [])].sort(
      (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime(),
    );
    const last = messages.at(-1);

    return {
      id: row.id,
      igUserId: row.ig_user_id,
      username: row.username,
      name: row.name,
      profilePicUrl: row.profile_pic_url,
      leadId: row.lead_id,
      leadName: row.leads?.student_name ?? null,
      assignedTo: row.assigned_to,
      counsellorName: row.profiles?.full_name ?? null,
      lastMessageAt: row.last_message_at,
      lastInboundAt: row.last_inbound_at,
      unreadCount: row.unread_count,
      lastMessagePreview: preview(last),
      lastDirection: last?.direction ?? null,
      messageCount: messages.length,
      awaitingReply: last?.direction === "inbound" && isWithinInstagramReplyWindow(row.last_inbound_at, now),
    };
  });
}

export interface InstagramMessageRow {
  id: string;
  direction: "inbound" | "outbound";
  body: string | null;
  attachmentType: string | null;
  attachmentUrl: string | null;
  replyToStory: string | null;
  status: string;
  errorMessage: string | null;
  sentAt: string;
  sentByName: string | null;
}

export async function getInstagramThread(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<InstagramMessageRow[]> {
  const { data } = await supabase
    .from("instagram_messages")
    .select(
      `id, direction, body, attachment_type, attachment_url, reply_to_story, status,
       error_message, sent_at, profiles ( full_name )`,
    )
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: true })
    .returns<
      Array<{
        id: string;
        direction: "inbound" | "outbound";
        body: string | null;
        attachment_type: string | null;
        attachment_url: string | null;
        reply_to_story: string | null;
        status: string;
        error_message: string | null;
        sent_at: string;
        profiles: { full_name: string } | null;
      }>
    >();

  return (data ?? []).map((row) => ({
    id: row.id,
    direction: row.direction,
    body: row.body,
    attachmentType: row.attachment_type,
    attachmentUrl: row.attachment_url,
    replyToStory: row.reply_to_story,
    status: row.status,
    errorMessage: row.error_message,
    sentAt: row.sent_at,
    sentByName: row.profiles?.full_name ?? null,
  }));
}

/** What to call somebody whose handle Meta would not give us. */
export function conversationTitle(row: Pick<InstagramConversationRow, "leadName" | "name" | "username" | "igUserId">): string {
  if (row.leadName) return row.leadName;
  if (row.username) return `@${row.username}`;
  if (row.name) return row.name;
  // An IGSID is seventeen digits of nothing. Shortened, because the full
  // number in a list column is worse than an honest placeholder.
  return `Instagram user …${row.igUserId.slice(-6)}`;
}
