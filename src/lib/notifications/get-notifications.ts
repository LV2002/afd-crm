import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export interface NotificationRow {
  id: string;
  event_key: string;
  title: string;
  body: string;
  href: string | null;
  read_at: string | null;
  created_at: string;
}

/**
 * A person's own notifications.
 *
 * Read through the caller's RLS-bound client, not the direct connection:
 * the `notifications_select` policy is `recipient_id = auth.uid()`, so the
 * database itself is what guarantees nobody reads anybody else's mail.
 * Passing a different recipient id here would return nothing, which is the
 * correct outcome and the reason this takes no such parameter.
 */
export async function getNotifications(
  supabase: SupabaseClient,
  options: { limit?: number; unreadOnly?: boolean } = {},
): Promise<NotificationRow[]> {
  let query = supabase
    .from("notifications")
    .select("id, event_key, title, body, href, read_at, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 50);

  if (options.unreadOnly) query = query.is("read_at", null);

  const { data } = await query.returns<NotificationRow[]>();
  return data ?? [];
}

/**
 * How many unread — the number on the bell.
 *
 * A head-only count so the layout doesn't drag fifty rows through on every
 * page load just to render a badge.
 */
export async function getUnreadCount(supabase: SupabaseClient): Promise<number> {
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .is("read_at", null);
  return count ?? 0;
}
