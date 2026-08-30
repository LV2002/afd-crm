import { MetaGraphApiError } from "./graph-client";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export interface MetaInsightsRow {
  campaign_id: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id: string;
  ad_name?: string;
  spend: string;
  impressions?: string;
  clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
}

/**
 * Ad-level daily spend for one account on one date — the finest grain
 * `ad_spend_daily` is keyed on. `level=ad` (not campaign/adset) so a
 * single row always has a real `ad_id`, matching `enquiries.ad_id` for
 * the CPL/ROAS joins this table exists for.
 */
export async function fetchMetaInsights(adAccountId: string, accessToken: string, date: string): Promise<MetaInsightsRow[]> {
  const url = new URL(`${GRAPH_BASE_URL}/act_${adAccountId}/insights`);
  url.searchParams.set("level", "ad");
  url.searchParams.set(
    "fields",
    "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,actions",
  );
  url.searchParams.set("time_range", JSON.stringify({ since: date, until: date }));
  url.searchParams.set("limit", "500");
  url.searchParams.set("access_token", accessToken);

  const rows: MetaInsightsRow[] = [];
  let nextUrl: string | null = url.toString();

  while (nextUrl) {
    const response: Response = await fetch(nextUrl);
    const body = await response.json();
    if (!response.ok) {
      throw new MetaGraphApiError(`Meta Insights API returned ${response.status} for act_${adAccountId}`, response.status, body);
    }
    rows.push(...(body.data ?? []));
    nextUrl = body.paging?.next ?? null;
  }

  return rows;
}

/** Meta's lead-form conversion shows up under one of these action_types depending on how the campaign is set up. */
const LEAD_ACTION_TYPES = new Set(["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"]);

function countLeadActions(actions: MetaInsightsRow["actions"]): number {
  if (!actions) return 0;
  return actions.filter((a) => LEAD_ACTION_TYPES.has(a.action_type)).reduce((sum, a) => sum + Number(a.value || 0), 0);
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
 * `spend` comes back as a decimal string in the ad account's own currency
 * — assumed INR here (AFD India's ad accounts are INR-denominated; a
 * multi-currency setup would need this parameterised, not attempted this
 * pass). `Math.round(... * 100)` rather than a naive `* 100` guards
 * against float artifacts like `123.45 * 100 === 12344.999999999998`.
 */
export function mapMetaInsightsRow(row: MetaInsightsRow): MappedAdSpendRow {
  return {
    campaignId: row.campaign_id,
    campaignName: row.campaign_name ?? null,
    adsetId: row.adset_id ?? null,
    adsetName: row.adset_name ?? null,
    adId: row.ad_id,
    adName: row.ad_name ?? null,
    spendPaise: Math.round(Number(row.spend || 0) * 100),
    impressions: Number(row.impressions || 0),
    clicks: Number(row.clicks || 0),
    leadsReported: countLeadActions(row.actions),
  };
}
