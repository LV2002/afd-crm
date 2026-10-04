import { count, eq, max, min, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { adSpendDaily } from "@/lib/db/schema";
import {
  backfillWindow,
  MAX_HISTORY_DAYS,
  type DateString,
  type SpendWindow,
} from "@/lib/integrations/ad-spend-window";
import { yesterdayDateStringIST } from "@/lib/format/date";

/**
 * How much ad spend history is actually stored, per platform.
 *
 * On screen so that "import past ad spend" is not a button pressed into
 * the dark: it says what you have before you press and what you have
 * after, which is the only way to tell a backfill that worked from one
 * that found nothing because the account had no spend then.
 */
export interface AdSpendHistory {
  platform: "meta" | "google";
  earliest: DateString | null;
  latest: DateString | null;
  /** Distinct days with at least one row — not the span, which would count empty days in. */
  daysStored: number;
  rows: number;
  /** What the next press of the button would fetch, or null when it is already as far back as it goes. */
  nextWindow: SpendWindow | null;
}

export async function adSpendHistory(
  platform: "meta" | "google",
  now: Date = new Date(),
): Promise<AdSpendHistory> {
  const [row] = await db
    .select({
      earliest: min(adSpendDaily.date),
      latest: max(adSpendDaily.date),
      days: sql<number>`count(distinct ${adSpendDaily.date})::int`,
      rows: count(),
    })
    .from(adSpendDaily)
    .where(eq(adSpendDaily.platform, platform));

  const earliest = row?.earliest ?? null;

  return {
    platform,
    earliest,
    latest: row?.latest ?? null,
    daysStored: row?.days ?? 0,
    rows: row?.rows ?? 0,
    nextWindow: backfillWindow({
      earliestStored: earliest,
      yesterday: yesterdayDateStringIST(now),
      maxHistoryDays: MAX_HISTORY_DAYS,
    }),
  };
}
