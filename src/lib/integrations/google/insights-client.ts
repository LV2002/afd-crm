import { searchGoogleAds, type GoogleAdsCredentials } from "./ads-client";

interface GoogleAdsSearchRow {
  campaign?: { id?: string; name?: string };
  adGroup?: { id?: string; name?: string };
  adGroupAd?: { ad?: { id?: string; name?: string } };
  metrics?: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number };
}

/**
 * Ad-level daily spend for one customer (account) on one date — the finest
 * grain `ad_spend_daily` is keyed on, same as Meta's `level=ad` Insights
 * call. `segments.date` pins the query to exactly one day; Google Ads
 * doesn't finalise a day's numbers immediately either, so this is always
 * called with "yesterday", same reasoning as the Meta sync.
 */
export async function fetchGoogleAdsSpend(customerId: string, credentials: GoogleAdsCredentials, date: string): Promise<GoogleAdsSearchRow[]> {
  const query = `
    SELECT
      campaign.id, campaign.name,
      ad_group.id, ad_group.name,
      ad_group_ad.ad.id, ad_group_ad.ad.name,
      metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
    FROM ad_group_ad
    WHERE segments.date = '${date}'
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
