import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export interface BroadcastFunnel {
  sent: number;
  delivered: number;
  read: number;
  replied: number;
}

/** Percent of `part` in `whole`, rounded, 0 when there is nothing to divide. */
export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/**
 * How far each broadcast's messages got: sent → delivered → read → replied.
 * Counted by the database per broadcast (head queries), so a large audience
 * never pulls its rows into the page.
 */
export async function broadcastFunnels(
  supabase: SupabaseClient,
  broadcastIds: string[],
): Promise<Map<string, BroadcastFunnel>> {
  const out = new Map<string, BroadcastFunnel>();
  await Promise.all(
    broadcastIds.map(async (id) => {
      const count = async (column: string) => {
        const { count: n } = await supabase
          .from("whatsapp_broadcast_recipients")
          .select("id", { count: "exact", head: true })
          .eq("broadcast_id", id)
          .not(column, "is", null);
        return n ?? 0;
      };
      const [sent, delivered, read, replied] = await Promise.all([
        count("sent_at"),
        count("delivered_at"),
        count("read_at"),
        count("replied_at"),
      ]);
      out.set(id, { sent, delivered, read, replied });
    }),
  );
  return out;
}
