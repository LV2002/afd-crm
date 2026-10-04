import { eq, max } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireCronSecret } from "@/lib/cron/require-secret";
import { reportingFailures } from "@/lib/errors/capture";

import { db } from "@/lib/db/client";
import { adSpendDaily } from "@/lib/db/schema";
import { yesterdayDateStringIST } from "@/lib/format/date";
import { spendSyncWindow } from "@/lib/integrations/ad-spend-window";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";
import { syncMetaAdSpend } from "@/lib/integrations/meta/sync-ad-spend";

export const dynamic = "force-dynamic";

/**
 * docs/02-BUILD-PHASES.md § Phase 5: "Ad spend sync (Meta + Google),
 * ad_spend_daily." Pulls per-ad, per-day spend for the configured account
 * and upserts it — same CRON_SECRET Bearer pattern as
 * sla-sweep/recompute-temperature (see that route's own comment for why),
 * never reachable by a browser session.
 *
 * Never syncs "today": ad platforms don't finalise a day's
 * spend/attribution until well after midnight, so a partial number would
 * be recorded as final and a report would already be trusting it.
 * Everything up to and including yesterday is fair game, and a run syncs
 * from wherever the stored data stops — plus a rolling re-read of the
 * last week, because Meta restates a day's figures for weeks afterwards.
 * See `spendSyncWindow()` for both, and for what it cost to only ever
 * fetch a single day.
 *
 * `?days=N` backfills N days ending yesterday, ignoring the automatic
 * bound. That is the way to pull history in on the day an account is
 * first connected: `/api/cron/ad-spend-sync/meta?days=365` with the cron
 * secret, once, by hand.
 */
async function run(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  // A Marketing API call (Insights, Custom Audiences) needs a token with
  // ads_read/ads_management — a Page access token generally can't read ad
  // account data, so this is deliberately a separate credential from
  // `page_access_token` (which the Lead Ads webhook uses to fetch a
  // submitted lead's own answers). See docs/DECISIONS.md.
  const { ad_account_id: adAccountId, ads_access_token: accessToken } =
    await getIntegrationCredentials("meta", ["ad_account_id", "ads_access_token"]);

  if (!adAccountId || !accessToken) {
    /*
      200, not a failure: an instance with no Meta ad account is not
      broken, and a nightly run that reports failure every night for a
      configuration nobody has filled in teaches everyone to ignore the
      alert.

      What it must not do is be silent about it, which is what this was.
      `skipped` is in the body so the nightly run's own JSON says so, and
      the Ad performance screen asks the same question of the credentials
      directly — "no spend" and "not connected" are different answers and
      only one of them needs anybody to do anything.
    */
    return NextResponse.json(
      {
        skipped: "not-configured",
        detail:
          "Meta ad_account_id/ads_access_token are not set (Settings → Integrations → Meta). No spend can be fetched until they are.",
      },
      { status: 200 },
    );
  }

  const yesterday = yesterdayDateStringIST(new Date());

  const [stored] = await db
    .select({ lastDate: max(adSpendDaily.date) })
    .from(adSpendDaily)
    .where(eq(adSpendDaily.platform, "meta"));

  const requestedDays = Number(new URL(request.url).searchParams.get("days"));

  const window = spendSyncWindow({
    lastSyncedDate: stored?.lastDate ?? null,
    yesterday,
    requestedDays: Number.isFinite(requestedDays) ? requestedDays : null,
  });

  const result = await syncMetaAdSpend(adAccountId, accessToken, window.since, window.until);

  return NextResponse.json({
    since: window.since,
    until: window.until,
    days: window.days,
    reason: window.reason,
    ...result,
  });
}

/**
 * Wrapped so a failure is recorded and emailed rather than disappearing
 * into a 500 that nobody looks at. It re-throws afterwards on purpose:
 * the platform's own retry and alerting depend on the route genuinely
 * failing, and swallowing it here would make a broken job look healthy.
 */
export async function GET(request: Request) {
  return reportingFailures("cron:ad-spend-sync/meta", () => run(request));
}
