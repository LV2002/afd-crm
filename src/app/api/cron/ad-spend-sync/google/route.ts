import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { adSpendDaily } from "@/lib/db/schema";
import { yesterdayDateStringIST } from "@/lib/format/date";
import { getGoogleAdsAccessToken } from "@/lib/integrations/google/ads-client";
import { fetchGoogleAdsSpend, mapGoogleAdsRow } from "@/lib/integrations/google/insights-client";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";

export const dynamic = "force-dynamic";

/**
 * Mirrors `/api/cron/ad-spend-sync/meta`: same CRON_SECRET Bearer auth,
 * same "always yesterday in IST" reasoning, same upsert-by-(date,
 * platform, ad_id) shape into the one shared `ad_spend_daily` table. The
 * one real difference is the extra OAuth hop every Google Ads API call
 * needs — the stored refresh token is exchanged for a short-lived access
 * token first.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    developer_token: developerToken,
    customer_id: customerId,
    login_customer_id: loginCustomerId,
  } = await getIntegrationCredentials("google", [
    "client_id",
    "client_secret",
    "refresh_token",
    "developer_token",
    "customer_id",
    "login_customer_id",
  ]);

  if (!clientId || !clientSecret || !refreshToken || !developerToken || !customerId) {
    return NextResponse.json({ error: "Google Ads credentials not fully configured" }, { status: 200 });
  }

  const accessToken = await getGoogleAdsAccessToken(clientId, clientSecret, refreshToken);
  const date = yesterdayDateStringIST(new Date());
  const rows = await fetchGoogleAdsSpend(customerId, { developerToken, accessToken, loginCustomerId }, date);

  let synced = 0;
  for (const row of rows) {
    const mapped = mapGoogleAdsRow(row);
    if (!mapped) continue;

    await db
      .insert(adSpendDaily)
      .values({
        date,
        platform: "google",
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
    synced++;
  }

  return NextResponse.json({ date, synced });
}
