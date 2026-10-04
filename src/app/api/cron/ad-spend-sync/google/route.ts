import { eq, max } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireCronSecret } from "@/lib/cron/require-secret";
import { reportingFailures } from "@/lib/errors/capture";

import { db } from "@/lib/db/client";
import { adSpendDaily } from "@/lib/db/schema";
import { yesterdayDateStringIST } from "@/lib/format/date";
import { spendSyncWindow } from "@/lib/integrations/ad-spend-window";
import { getGoogleAdsAccessToken } from "@/lib/integrations/google/ads-client";
import { syncGoogleAdSpend } from "@/lib/integrations/google/sync-ad-spend";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";
import { uploadConversions } from "@/lib/integrations/google/upload-conversions";

export const dynamic = "force-dynamic";

/**
 * Mirrors `/api/cron/ad-spend-sync/meta`: same CRON_SECRET Bearer auth,
 * same window logic (from wherever the stored data stops up to yesterday,
 * plus a rolling re-read of the last week — Google restates a day's
 * figures too), same upsert-by-(date, platform, ad_id) shape into the one
 * shared `ad_spend_daily` table. The one real difference is the extra
 * OAuth hop every Google Ads API call needs — the stored refresh token is
 * exchanged for a short-lived access token first.
 *
 * `?days=N` backfills N days ending yesterday, same as Meta's.
 */
async function run(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

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
    /*
      200, not a failure: an instance with no Google Ads account is not
      broken, and a nightly run that reports failure every night for a
      configuration nobody has filled in teaches everyone to ignore the
      alert. But it must not be silent about it either — which it was,
      behind an `error` key the nightly runner reads as success. Same fix
      as the Meta route's.
    */
    return NextResponse.json(
      {
        skipped: "not-configured",
        detail:
          "Google Ads credentials are not fully set (Settings → Integrations → Google). No spend can be fetched until they are.",
      },
      { status: 200 },
    );
  }

  const accessToken = await getGoogleAdsAccessToken(clientId, clientSecret, refreshToken);
  const yesterday = yesterdayDateStringIST(new Date());

  const [stored] = await db
    .select({ lastDate: max(adSpendDaily.date) })
    .from(adSpendDaily)
    .where(eq(adSpendDaily.platform, "google"));

  const requestedDays = Number(new URL(request.url).searchParams.get("days"));

  const window = spendSyncWindow({
    lastSyncedDate: stored?.lastDate ?? null,
    yesterday,
    requestedDays: Number.isFinite(requestedDays) ? requestedDays : null,
  });

  const result = await syncGoogleAdSpend(
    customerId,
    { developerToken, accessToken, loginCustomerId },
    window.since,
    window.until,
  );

  // Reporting admissions back to Google runs in the same job.
  //
  // It has its own route (/api/cron/google-conversions) and a dedicated
  // cron should point there, but AFD's plan has no slots left. The
  // pairing is a natural one anyway: the job that reads what Google
  // charged and the job that tells Google what it bought belong
  // together. It never throws into the spend sync — a conversion upload
  // failing must not lose a day of spend data.
  let conversions;
  try {
    conversions = await uploadConversions();
  } catch (error) {
    conversions = { error: error instanceof Error ? error.message : String(error) };
  }

  return NextResponse.json({
    since: window.since,
    until: window.until,
    days: window.days,
    reason: window.reason,
    ...result,
    conversions,
  });
}

/**
 * Wrapped so a failure is recorded and emailed rather than disappearing
 * into a 500 that nobody looks at. It re-throws afterwards on purpose:
 * the platform's own retry and alerting depend on the route genuinely
 * failing, and swallowing it here would make a broken job look healthy.
 */
export async function GET(request: Request) {
  return reportingFailures("cron:ad-spend-sync/google", () => run(request));
}
