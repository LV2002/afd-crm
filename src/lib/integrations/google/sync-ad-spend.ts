import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { adSpendDaily } from "@/lib/db/schema";
import type { AdSpendSyncResult } from "@/lib/integrations/meta/sync-ad-spend";

import type { GoogleAdsCredentials } from "./ads-client";
import { fetchGoogleAdsSpend, mapGoogleAdsRow } from "./insights-client";

/**
 * Fetch a window of Google Ads spend and store it. The Google twin of
 * `syncMetaAdSpend()`, deliberately the same shape so the nightly cron
 * and the Settings backfill button both call one function per platform
 * rather than four implementations of the same upsert.
 *
 * Kept as its own module rather than parameterised into one: the two
 * clients take different credentials, return different row shapes and
 * skip rows for different reasons, and the one thing they genuinely
 * share — the upsert — is eight lines. A shared abstraction here would be
 * longer than the duplication it removed.
 */
const BATCH_SIZE = 200;

export async function syncGoogleAdSpend(
  customerId: string,
  credentials: GoogleAdsCredentials,
  since: string,
  until: string,
): Promise<AdSpendSyncResult> {
  const rows = await fetchGoogleAdsSpend(customerId, credentials, since, until);

  const datesSeen = new Set<string>();
  let undated = 0;

  const values = rows.flatMap((row) => {
    // The row's own date, from `segments.date`. Storing a whole backfill
    // under the date it was requested for would make every figure on the
    // Ad performance screen wrong in the most convincing way possible.
    const date = row.segments?.date;
    const mapped = mapGoogleAdsRow(row);
    if (!date || !mapped) {
      undated += 1;
      return [];
    }

    datesSeen.add(date);
    return [
      {
        date,
        platform: "google" as const,
        accountId: customerId,
        campaignId: mapped.campaignId,
        campaignName: mapped.campaignName,
        adsetId: mapped.adsetId,
        adsetName: mapped.adsetName,
        adId: mapped.adId,
        adName: mapped.adName,
        spendPaise: mapped.spendPaise,
        impressions: mapped.impressions,
        clicks: mapped.clicks,
        leadsReported: mapped.leadsReported,
      },
    ];
  });

  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    await db
      .insert(adSpendDaily)
      .values(values.slice(i, i + BATCH_SIZE))
      .onConflictDoUpdate({
        target: [adSpendDaily.date, adSpendDaily.platform, adSpendDaily.adId],
        set: {
          campaignName: sql`excluded.campaign_name`,
          adsetName: sql`excluded.adset_name`,
          adName: sql`excluded.ad_name`,
          spendPaise: sql`excluded.spend_paise`,
          impressions: sql`excluded.impressions`,
          clicks: sql`excluded.clicks`,
          leadsReported: sql`excluded.leads_reported`,
          updatedAt: new Date(),
        },
      });
  }

  return { synced: values.length, daysWithSpend: datesSeen.size, undated };
}
