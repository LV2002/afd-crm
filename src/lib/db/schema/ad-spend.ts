import { bigint, date, integer, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { idColumn, timestamps } from "./_helpers";

export const adPlatformEnum = pgEnum("ad_platform", ["meta", "google"]);

/**
 * docs/01-DATA-MODEL.md § Marketing spend. Synced nightly from each
 * platform's own reporting API (Meta Insights, Google Ads reporting) —
 * never computed from `enquiries`, since spend/impressions/clicks only
 * exist on the ad platform's side. Joins to `enquiries.campaign_id`/
 * `ad_id` for CPL, and through to `enrolments` for cost-per-admission and
 * ROAS (Phase 5 reporting, not built this pass — this table exists so
 * that reporting has real data to query once it is).
 */
export const adSpendDaily = pgTable(
  "ad_spend_daily",
  {
    id: idColumn(),
    date: date("date").notNull(),
    platform: adPlatformEnum("platform").notNull(),
    accountId: text("account_id").notNull(),
    campaignId: text("campaign_id").notNull(),
    campaignName: text("campaign_name"),
    adsetId: text("adset_id"),
    adsetName: text("adset_name"),
    adId: text("ad_id").notNull(),
    adName: text("ad_name"),
    spendPaise: bigint("spend_paise", { mode: "number" }).notNull(),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    leadsReported: integer("leads_reported").notNull().default(0),
    ...timestamps(),
  },
  (t) => [uniqueIndex("ad_spend_daily_date_platform_ad_id_uq").on(t.date, t.platform, t.adId)],
);
