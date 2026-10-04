import { searchGoogleAds, type GoogleAdsCredentials } from "./ads-client";

export interface GoogleAdsSearchRow {
  /** Present because every query asks for `segments.date` — this is the day the row is for. */
  segments?: { date?: string };
  campaign?: { id?: string; name?: string };
  adGroup?: { id?: string; name?: string };
  adGroupAd?: { ad?: { id?: string; name?: string } };
  metrics?: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number };
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GAQL has no parameter binding — a query is a string, and these dates go
 * into it by interpolation. They come from this codebase's own date
 * helpers today, but a backfill button puts a number a person typed at
 * the far end of the same path, so the shape is checked here rather than
 * trusted. A rejected date is a thrown error, not a silently empty
 * result.
 */
function assertDate(label: string, value: string): void {
  if (!DATE_ONLY.test(value)) {
    throw new Error(`Google Ads spend sync: ${label} must be a yyyy-MM-dd date, got "${value}"`);
  }
}

/**
 * Ad-level daily spend for one customer (account) over a range of dates —
 * the finest grain `ad_spend_daily` is keyed on, same as Meta's
 * `level=ad` Insights call.
 *
 * `segments.date` is in the SELECT as well as the WHERE, and that is what
 * makes a range safe: segmenting by date gives one row per ad per day,
 * each carrying the day it belongs to, instead of one summed row for the
 * whole window. The caller stores each row under its own date, never the
 * date it asked for.
 *
 * `until` defaults to `since`, so the original one-day call is unchanged.
 * Google Ads doesn't finalise a day's numbers immediately, so the latest
 * day this is ever called with is yesterday — same reasoning as Meta.
 */
export async function fetchGoogleAdsSpend(
  customerId: string,
  credentials: GoogleAdsCredentials,
  since: string,
  until: string = since,
): Promise<GoogleAdsSearchRow[]> {
  assertDate("since", since);
  assertDate("until", until);

  const query = `
    SELECT
      segments.date,
      campaign.id, campaign.name,
      ad_group.id, ad_group.name,
      ad_group_ad.ad.id, ad_group_ad.ad.name,
      metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
    FROM ad_group_ad
    WHERE segments.date BETWEEN '${since}' AND '${until}'
  `.trim();

  return searchGoogleAds<GoogleAdsSearchRow>(customerId, credentials, query);
}

export interface MappedAdSpendRow {
  campaignId: string;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  adId: string;
  adName: string | null;
  spendPaise: number;
  impressions: number;
  clicks: number;
  leadsReported: number;
}

/**
 * `cost_micros` is always in the account's own currency, in millionths of
 * a unit (1,000,000 micros = ₹1) — assumed INR here, same assumption and
 * same caveat as Meta's mapper (see docs/DECISIONS.md). `metrics.conversions`
 * is used as the "leads reported" figure: it's every conversion action
 * counted, not specifically lead-form submissions, since isolating just
 * the lead-form conversion action would need a per-account conversion
 * action id configured ahead of time. Correct only insofar as an account's
 * conversion actions are actually just its lead forms — a reasonable
 * assumption for this system's current, single-purpose ad accounts, wrong
 * the moment a client also tracks e.g. page-view conversions on the same
 * account. Flagged rather than built around, per CLAUDE.md's steer against
 * solving hypothetical requirements.
 */
export function mapGoogleAdsRow(row: GoogleAdsSearchRow): MappedAdSpendRow | null {
  const campaignId = row.campaign?.id;
  const adId = row.adGroupAd?.ad?.id;
  if (!campaignId || !adId) return null;

  return {
    campaignId,
    campaignName: row.campaign?.name ?? null,
    adsetId: row.adGroup?.id ?? null,
    adsetName: row.adGroup?.name ?? null,
    adId,
    adName: row.adGroupAd?.ad?.name ?? null,
    spendPaise: Math.round(Number(row.metrics?.costMicros ?? 0) / 10_000),
    impressions: Number(row.metrics?.impressions ?? 0),
    clicks: Number(row.metrics?.clicks ?? 0),
    leadsReported: Math.round(Number(row.metrics?.conversions ?? 0)),
  };
}
