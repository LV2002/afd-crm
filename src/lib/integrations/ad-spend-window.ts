/**
 * Which days of ad spend a sync run should fetch.
 *
 * The nightly job used to fetch exactly one day — yesterday — which is
 * right for a job that has always been running and wrong for every other
 * situation. It meant:
 *
 * - **No history.** On the day the ad credentials were entered the table
 *   was empty, and it stayed empty until the next night, then held one
 *   day, then two. The Ad performance screen defaults to ninety days, so
 *   for weeks it showed a blank where months of real spend existed on
 *   Meta's side. That is what "the spend isn't showing" was.
 * - **No recovery.** A run that was skipped for budget (see
 *   cron/nightly-runner.ts — spend sync is deliberately last), or failed,
 *   or happened while the token was expired, left a permanent hole. The
 *   next night fetched the next day and nothing ever went back for it.
 *
 * So a run syncs from wherever the data actually stops up to yesterday,
 * bounded, and always re-reads the last few days on top. Pure, because
 * "which days" is arithmetic with five edge cases and the alternative is
 * finding out from a wrong chart.
 */

/** A plain `yyyy-MM-dd`. */
export type DateString = string;

export interface SpendWindowInput {
  /** The latest date already stored for this platform, or null when there is none. */
  lastSyncedDate: DateString | null;
  /** Yesterday, in IST — the most recent day whose spend a platform has finalised. */
  yesterday: DateString;
  /** An explicit `?days=N` from the caller, for a one-off backfill. */
  requestedDays?: number | null;
  /** How far back a run will ever go on its own. */
  maxBackfillDays?: number;
  /** How many recent days every run re-reads, whatever is already stored. */
  lookbackDays?: number;
}

export interface SpendWindow {
  since: DateString;
  until: DateString;
  /** Days inclusive — what the caller reports, and what makes a run's size visible in a log. */
  days: number;
  /** Why this window, in words, for the run's own JSON response. */
  reason: "requested" | "first-run" | "gap" | "refresh";
}

/**
 * A fresh instance with no spend rows at all pulls this much history, so
 * the default ninety-day report has something in it the first morning
 * after the credentials are saved rather than three months later.
 *
 * Ninety rather than everything Meta has: `time_increment=1` returns one
 * row per ad per day, and a year of a busy account is a lot of rows to
 * page through inside a cron run that shares a 50-second budget with nine
 * other jobs. A longer backfill is one `?days=365` call away and is the
 * right way to do it — once, by hand, watching it.
 */
export const DEFAULT_BACKFILL_DAYS = 90;

/**
 * Every run re-reads this many recent days even when it already has them.
 *
 * Not redundancy: Meta restates a day's figures for up to 28 days after
 * it, as late conversions are attributed and invalid clicks are credited
 * back, and Google does the same. A sync that only ever fetched days it
 * was missing would keep the first number it ever saw for each day and
 * quietly disagree with Ads Manager for ever.
 *
 * Seven rather than twenty-eight because the restatements that matter are
 * nearly all within the first week, and the cost of this is paid nightly
 * while the benefit shrinks fast. A full re-read is `?days=28` when a
 * number is being argued about.
 */
export const DEFAULT_LOOKBACK_DAYS = 7;

function addDaysToDateString(date: DateString, delta: number): DateString {
  // Parsed as UTC midnight on purpose: these are plain calendar dates
  // with no time zone of their own (the caller already resolved IST), and
  // UTC is the one zone where day arithmetic can't be bitten by DST.
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + delta);
  return parsed.toISOString().slice(0, 10);
}

function daysBetween(since: DateString, until: DateString): number {
  const from = new Date(`${since}T00:00:00Z`).getTime();
  const to = new Date(`${until}T00:00:00Z`).getTime();
  return Math.floor((to - from) / 86_400_000) + 1;
}

export function spendSyncWindow(input: SpendWindowInput): SpendWindow {
  const { lastSyncedDate, yesterday } = input;
  const maxBackfillDays = input.maxBackfillDays ?? DEFAULT_BACKFILL_DAYS;
  const lookbackDays = input.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;

  const earliest = addDaysToDateString(yesterday, -(maxBackfillDays - 1));

  const requested = input.requestedDays;
  if (requested && Number.isFinite(requested) && requested > 0) {
    // An explicit request is not capped by `maxBackfillDays`: somebody
    // typed it, and the cap exists to stop an unattended job doing
    // something enormous, not to stop an admin backfilling a year.
    const since = addDaysToDateString(yesterday, -(Math.floor(requested) - 1));
    return { since, until: yesterday, days: daysBetween(since, yesterday), reason: "requested" };
  }

  if (!lastSyncedDate) {
    return { since: earliest, until: yesterday, days: maxBackfillDays, reason: "first-run" };
  }

  // The rolling re-read window, and the floor under everything below: a
  // run never fetches less than this, so restated figures are picked up.
  const lookbackStart = addDaysToDateString(yesterday, -(lookbackDays - 1));

  // A stored date that is behind the lookback leaves a genuine hole to
  // fill; one inside it (or, if a clock or a time zone ever disagrees,
  // ahead of it) just gets the rolling refresh.
  const reason: SpendWindow["reason"] = lastSyncedDate < lookbackStart ? "gap" : "refresh";

  const candidate = lastSyncedDate < lookbackStart ? lastSyncedDate : lookbackStart;
  const since = candidate < earliest ? earliest : candidate;

  return { since, until: yesterday, days: daysBetween(since, yesterday), reason };
}
