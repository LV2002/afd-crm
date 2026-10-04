import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { adSpendDaily } from "@/lib/db/schema";

import { fetchMetaInsights, mapMetaInsightsRow } from "./insights-client";

/**
 * Fetch a window of Meta ad spend and store it.
 *
 * Extracted from the nightly cron route so the Settings screen's "Import
 * past ad spend" button runs the same code rather than a second
 * implementation of it. A backfill done by hand and a backfill done at
 * night must not be able to disagree about what a day's spend was.
 */

export interface AdSpendSyncResult {
  /** Rows written (one per ad per day). */
  synced: number;
  /** Distinct days that had any spend at all in them. */
  daysWithSpend: number;
  /** Rows Meta returned with no date, which are skipped — see below. */
  undated: number;
}

/** Postgres caps a statement at 65,535 parameters; thirteen columns a row leaves plenty of room at this size, and it keeps one failed batch small. */
const BATCH_SIZE = 200;

export async function syncMetaAdSpend(
  adAccountId: string,
  accessToken: string,
  since: string,
  until: string,
): Promise<AdSpendSyncResult> {
  const rows = await fetchMetaInsights(adAccountId, accessToken, since, until);

  const datesSeen = new Set<string>();
  let undated = 0;

  const values = rows.flatMap((row) => {
    /*
      The row's own date, not the window's. `time_increment=1` returns one
      row per ad per day and `date_start` is the day it belongs to;
      storing every row under one date would pile a whole backfill onto a
      single day and make every number on the Ad performance screen wrong
      in the most convincing way possible.

      A row without one is skipped rather than guessed at: there is no
      honest date to file it under, and a wrong date is worse than a
      missing row. Counted, so a run that drops rows says so instead of
      quietly returning a smaller number.
    */
    const date = row.date_start;
    if (!date) {
      undated += 1;
      return [];
    }

    datesSeen.add(date);
    const mapped = mapMetaInsightsRow(row);
    return [
      {
        date,
        platform: "meta" as const,
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
      },
    ];
  });

  /*
    Batched rather than one statement per row. A year of a busy account is
    tens of thousands of rows, and a round trip each would not finish
    inside a serverless function's limit — which would look exactly like a
    backfill that silently imports the first few weeks.
  */
  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    await db
      .insert(adSpendDaily)
      .values(values.slice(i, i + BATCH_SIZE))
      .onConflictDoUpdate({
        target: [adSpendDaily.date, adSpendDaily.platform, adSpendDaily.adId],
        // `excluded` is the row that was being inserted — the only way to
        // say "take the new value" in a multi-row upsert.
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
