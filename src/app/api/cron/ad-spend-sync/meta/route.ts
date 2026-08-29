import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { adSpendDaily } from "@/lib/db/schema";
import { yesterdayDateStringIST } from "@/lib/format/date";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";
import { fetchMetaInsights, mapMetaInsightsRow } from "@/lib/integrations/meta/insights-client";

export const dynamic = "force-dynamic";

/**
 * docs/02-BUILD-PHASES.md § Phase 5: "Ad spend sync (Meta + Google),
 * ad_spend_daily." Pulls yesterday's per-ad spend for the configured
 * account and upserts it — same CRON_SECRET Bearer pattern as
 * sla-sweep/recompute-temperature (see that route's own comment for why),
 * never reachable by a browser session.
 *
 * Runs once a day, always for "yesterday": ad platforms don't finalise a
 * day's spend/attribution numbers until well after midnight, so syncing
 * "today" partway through would record an incomplete number that a
 * report might already be trusting.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { ad_account_id: adAccountId, page_access_token: accessToken } = await getIntegrationCredentials("meta", [
    "ad_account_id",
    "page_access_token",
  ]);

  if (!adAccountId || !accessToken) {
    return NextResponse.json({ error: "Meta ad_account_id/page_access_token not configured" }, { status: 200 });
  }

  const date = yesterdayDateStringIST(new Date());
  const rows = await fetchMetaInsights(adAccountId, accessToken, date);

  for (const row of rows) {
    const mapped = mapMetaInsightsRow(row);
    await db
      .insert(adSpendDaily)
      .values({
        date,
        platform: "meta",
        accountId: adAccountId,
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
      })
      .onConflictDoUpdate({
        target: [adSpendDaily.date, adSpendDaily.platform, adSpendDaily.adId],
        set: {
          campaignName: mapped.campaignName,
          adsetName: mapped.adsetName,
          adName: mapped.adName,
          spendPaise: mapped.spendPaise,
          impressions: mapped.impressions,
          clicks: mapped.clicks,
          leadsReported: mapped.leadsReported,
          updatedAt: new Date(),
        },
      });
  }

  return NextResponse.json({ date, synced: rows.length });
}
