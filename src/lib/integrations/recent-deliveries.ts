import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type WebhookSource = "meta_leads" | "google_leads" | "whatsapp" | "website" | "knorish" | "instagram";

export interface WebhookDelivery {
  id: string;
  external_id: string;
  signature_ok: boolean;
  status: "pending" | "done" | "failed";
  attempts: number;
  last_error: string | null;
  received_at: string;
  processed_at: string | null;
}

/**
 * The last few things a platform actually sent us.
 *
 * Every handler writes the raw delivery to `webhook_events` before
 * processing it (CLAUDE.md non-negotiable #9), which has always made the
 * answer to "did Meta reach us?" a row in a table — and until now there
 * was no screen showing that table. So the one question worth asking
 * when leads are not arriving could only be answered with a SQL console,
 * which for this institute means not at all.
 *
 * Read through the caller's own client: `webhook_events_select` already
 * limits this to `settings.manage` at org scope (migration 0022), because
 * a raw payload carries a student's details before anything has resolved
 * them into a lead. No service-role bypass, and deliberately no raw
 * payload on screen — the metadata is what diagnoses delivery, and an
 * admin screen is still not a place to spray phone numbers.
 */
export async function recentWebhookDeliveries(
  supabase: SupabaseClient,
  source: WebhookSource,
  limit = 10,
): Promise<WebhookDelivery[]> {
  const { data } = await supabase
    .from("webhook_events")
    .select("id, external_id, signature_ok, status, attempts, last_error, received_at, processed_at")
    .eq("source", source)
    .order("received_at", { ascending: false })
    .limit(limit)
    .returns<WebhookDelivery[]>();

  return data ?? [];
}
