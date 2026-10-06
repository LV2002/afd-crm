import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Why a broadcast's messages did not arrive.
 *
 * ## Why this had to be written
 *
 * The sweep records a reason on every recipient it could not send to —
 * Meta's own refusal, verbatim — and **no screen has ever shown it**. A
 * broadcast that failed displayed `1 / 1 (1 failed)` in red, and that was
 * the end of what anybody could learn from inside the CRM. The answer was
 * in the database the whole time.
 *
 * The reasons are worth reading because they are almost always
 * actionable and almost never about this code: a template name that does
 * not exist in the language asked for, a number outside the test
 * allow-list while the app is unverified, a 24-hour window that has
 * closed, an access token missing `whatsapp_business_messaging`.
 *
 * ## Grouped, not listed
 *
 * Four hundred recipients failing for one reason is one fact, not four
 * hundred. A per-recipient list would bury it, and would also put four
 * hundred phone numbers on a screen that does not need them — the
 * reasons are what is diagnostic, the numbers are not.
 */

export interface BroadcastFailure {
  reason: string;
  count: number;
}

export async function broadcastFailureReasons(
  supabase: SupabaseClient,
  broadcastIds: string[],
): Promise<Map<string, BroadcastFailure[]>> {
  const byBroadcast = new Map<string, BroadcastFailure[]>();
  if (broadcastIds.length === 0) return byBroadcast;

  const { data } = await supabase
    .from("whatsapp_broadcast_recipients")
    .select("broadcast_id, error_message")
    .in("broadcast_id", broadcastIds)
    .eq("status", "failed")
    .not("error_message", "is", null)
    .returns<Array<{ broadcast_id: string; error_message: string | null }>>();

  const counts = new Map<string, Map<string, number>>();
  for (const row of data ?? []) {
    const reason = (row.error_message ?? "").trim();
    if (!reason) continue;
    if (!counts.has(row.broadcast_id)) counts.set(row.broadcast_id, new Map());
    const forBroadcast = counts.get(row.broadcast_id)!;
    forBroadcast.set(reason, (forBroadcast.get(reason) ?? 0) + 1);
  }

  for (const [broadcastId, reasons] of counts) {
    byBroadcast.set(
      broadcastId,
      [...reasons.entries()]
        // Commonest first: with several reasons, the one affecting most
        // people is the one worth fixing first.
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([reason, count]) => ({ reason, count })),
    );
  }

  return byBroadcast;
}
