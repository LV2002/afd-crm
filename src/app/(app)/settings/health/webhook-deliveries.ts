import "server-only";

import { desc, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { customWebhooks, webhookEvents } from "@/lib/db/schema";

/**
 * What each inbound channel has actually delivered lately.
 *
 * Every webhook handler in this system persists before it processes —
 * non-negotiable #9 — and that includes the deliveries it *rejects*: a
 * bad signature is written down with `signature_ok = false` before the
 * 401 goes back. All of which was invisible, because nothing read the
 * table.
 *
 * The cost of that showed up the first time inbound WhatsApp went
 * missing. "No messages in the inbox" has three completely different
 * causes with three different fixes:
 *
 *   1. **Meta never called** — the callback URL or the field
 *      subscription is wrong, in Meta's dashboard.
 *   2. **Meta called and was turned away** — the app secret stored in
 *      this CRM does not match the app sending, so every delivery 401s.
 *   3. **Meta called and we stored it** — the problem is downstream, in
 *      how the inbox is filtered or which number it arrived on.
 *
 * From an empty inbox these are indistinguishable. From this summary
 * they are three different rows, and the second one — the one that had
 * actually happened — is the one nobody would ever have guessed.
 *
 * Grouped per source rather than listed raw, because the question is
 * "is this channel working?" and a hundred successful rows answer it no
 * better than one.
 */
export interface WebhookSourceHealth {
  source: string;
  /**
   * The endpoint's own name for a custom endpoint, so "Google Ads" and
   * "Shiksha" are two rows and not one "Custom endpoints" that hides which
   * of them has gone quiet. Null for the built-in channels.
   */
  endpointName: string | null;
  /** The key the delivery log filters on. */
  key: string;
  total: number;
  /**
   * Deliveries that were turned away at the door: a bad signature or key, and
   * refused (status `failed`). An unsigned delivery that an endpoint is set to
   * accept has `signature_ok = false` too but WAS processed, so it is not
   * counted — it used to be, which made a working endpoint look broken.
   */
  rejected: number;
  /**
   * Whether the NEWEST delivery on this channel was one of those. This, not the
   * count, is what says the channel is broken now: an endpoint whose signing was
   * fixed last week still has last week's rejections in the window.
   */
  rejectedLatest: boolean;
  lastRejectedAt: string | null;
  failed: number;
  lastAt: string | null;
  lastError: string | null;
}

export async function recentWebhookDeliveries(days = 7): Promise<WebhookSourceHealth[]> {
  const rows = await db
    .select({
      source: webhookEvents.source,
      customWebhookId: webhookEvents.customWebhookId,
      endpointName: sql<string | null>`max(${customWebhooks.name})`,
      total: sql<number>`count(*)`,
      rejected: sql<number>`count(*) filter (where ${webhookEvents.signatureOk} = false and ${webhookEvents.status} = 'failed')`,
      rejectedLatest: sql<boolean>`(array_agg(${webhookEvents.signatureOk} = false and ${webhookEvents.status} = 'failed' order by ${webhookEvents.receivedAt} desc))[1]`,
      lastRejectedAt: sql<Date | null>`max(${webhookEvents.receivedAt}) filter (where ${webhookEvents.signatureOk} = false and ${webhookEvents.status} = 'failed')`,
      failed: sql<number>`count(*) filter (where ${webhookEvents.status} = 'failed')`,
      lastAt: sql<Date | null>`max(${webhookEvents.receivedAt})`,
      // The most recent complaint, whatever it was. Prefer a rejection's
      // reason over a processing error: a signature that does not match
      // makes every other diagnosis moot.
      lastError: sql<string | null>`(
        array_agg(${webhookEvents.lastError} order by (${webhookEvents.signatureOk} = false) desc, ${webhookEvents.receivedAt} desc)
        filter (where ${webhookEvents.lastError} is not null)
      )[1]`,
    })
    .from(webhookEvents)
    .leftJoin(customWebhooks, sql`${customWebhooks.id} = ${webhookEvents.customWebhookId}`)
    .where(sql`${webhookEvents.receivedAt} > now() - make_interval(days => ${days})`)
    .groupBy(webhookEvents.source, webhookEvents.customWebhookId)
    .orderBy(desc(sql`max(${webhookEvents.receivedAt})`));

  return rows.map((row) => ({
    source: row.source,
    endpointName: row.customWebhookId ? (row.endpointName ?? "Custom endpoint (removed)") : null,
    key: row.customWebhookId ? `custom:${row.customWebhookId}` : row.source,
    total: Number(row.total),
    rejected: Number(row.rejected),
    rejectedLatest: row.rejectedLatest === true,
    lastRejectedAt: row.lastRejectedAt ? new Date(row.lastRejectedAt).toISOString() : null,
    failed: Number(row.failed),
    lastAt: row.lastAt ? new Date(row.lastAt).toISOString() : null,
    lastError: row.lastError,
  }));
}
