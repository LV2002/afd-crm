import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { adSpendHistory } from "./ad-spend-history";
import type { AdSpendSyncResult } from "./meta/sync-ad-spend";
import { platformLabel } from "./platforms";

export interface BackfillState {
  error?: string;
  success?: string;
}

/**
 * One press of **Import past ad spend**, for either platform.
 *
 * The permission check, the window, the audit row and the sentence that
 * comes back are identical for Meta and Google; only fetching the
 * credentials and calling the right client differ, and those are the
 * caller's two lines. Shared because a backfill that an admin can run by
 * hand is a thing worth being consistent about — the same bounds, the
 * same trail, the same answer.
 *
 * `sync` is handed the window and returns what it stored. Returning a
 * message rather than throwing: every outcome here is one an admin can
 * act on, including "nothing came back", which is not an error and must
 * not read as one.
 */
export async function runAdSpendBackfill(
  platform: "meta" | "google",
  sync: (since: string, until: string) => Promise<AdSpendSyncResult>,
): Promise<BackfillState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const history = await adSpendHistory(platform);
  const window = history.nextWindow;

  if (!window) {
    return {
      success: `Already back to ${history.earliest}, which is as far as ${platformLabel(platform)} keeps its figures. There is nothing older to fetch.`,
    };
  }

  const result = await sync(window.since, window.until);

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "ad_spend.backfill",
    entityType: "ad_spend_daily",
    after: {
      platform,
      since: window.since,
      until: window.until,
      synced: result.synced,
      daysWithSpend: result.daysWithSpend,
    },
  });

  if (result.synced === 0) {
    // Not a failure, and the difference matters: an account that was not
    // running ads in that window has nothing to return, and saying "0
    // imported" without saying which days reads as broken.
    return {
      success: `Asked ${platformLabel(platform)} for ${window.since} to ${window.until} and it reported no spend in those days. Press again to go back further.`,
    };
  }

  const undated = result.undated > 0 ? ` ${result.undated} row(s) arrived with no date and were skipped.` : "";

  return {
    success: `Imported ${window.since} to ${window.until}: ${result.synced} rows across ${result.daysWithSpend} day(s) with spend.${undated} Press again to go back another ${window.days} days.`,
  };
}
