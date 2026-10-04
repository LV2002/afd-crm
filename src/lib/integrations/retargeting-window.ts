import { db } from "@/lib/db/client";
import { orgSettings } from "@/lib/db/schema";

import { DEFAULT_RETARGETING_WINDOW_DAYS } from "./audience-sync";

/**
 * The configured retargeting window, for the two sync crons.
 *
 * Reads `org_settings` on the direct db client — these callers are cron
 * routes with no session, the one place CLAUDE.md non-negotiable #3
 * allows it. Falls back to the default rather than throwing: a
 * misconfigured window must not be the reason a lead who consented stops
 * being reached, and 180 days is the answer the institute asked for.
 */
export async function retargetingWindowDays(): Promise<number> {
  const [row] = await db
    .select({ days: orgSettings.retargetingWindowDays })
    .from(orgSettings)
    .limit(1);

  const days = row?.days;
  if (typeof days !== "number" || !Number.isFinite(days) || days < 0) {
    return DEFAULT_RETARGETING_WINDOW_DAYS;
  }
  return days;
}
