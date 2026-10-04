/**
 * The nightly spend sync fetched exactly one day — yesterday — which is
 * correct for a job that has always run and wrong on the day an ad
 * account is first connected: the table starts empty and fills one day at
 * a time, while the Ad performance screen looks back ninety. That is why
 * the spend showed as nothing when months of it existed on Meta's side.
 *
 * These are the cases that decides.
 */
import { describe, expect, it } from "vitest";

import {
  backfillWindow,
  DEFAULT_BACKFILL_CHUNK_DAYS,
  DEFAULT_BACKFILL_DAYS,
  DEFAULT_LOOKBACK_DAYS,
  spendSyncWindow,
} from "../src/lib/integrations/ad-spend-window";

describe("spendSyncWindow", () => {
  it("backfills on the first run, so the default report is not blank for three months", () => {
    const window = spendSyncWindow({ lastSyncedDate: null, yesterday: "2026-10-03" });
    expect(window).toEqual({
      since: "2026-07-06",
      until: "2026-10-03",
      days: DEFAULT_BACKFILL_DAYS,
      reason: "first-run",
    });
  });

  it("fills the gap left by a run that was skipped, failed, or had an expired token", () => {
    // Spend sync is deliberately last in the nightly budget, so being
    // skipped is a normal event — and before this, every skipped night
    // was a permanent hole.
    const window = spendSyncWindow({ lastSyncedDate: "2026-08-28", yesterday: "2026-10-03" });
    expect(window).toMatchObject({ since: "2026-08-28", until: "2026-10-03", reason: "gap" });
  });

  it("re-reads the last week even when nothing is missing", () => {
    // Meta restates a day's figures for weeks after it, as late
    // conversions land and invalid clicks are credited back. A sync that
    // only fetched missing days would keep the first number it ever saw
    // and disagree with Ads Manager for ever.
    const window = spendSyncWindow({ lastSyncedDate: "2026-10-03", yesterday: "2026-10-03" });
    expect(window).toEqual({
      since: "2026-09-27",
      until: "2026-10-03",
      days: DEFAULT_LOOKBACK_DAYS,
      reason: "refresh",
    });
  });

  it("still only refreshes when the stored date is somehow ahead of yesterday", () => {
    // A clock or a time zone disagreeing must not produce a backwards
    // window.
    const window = spendSyncWindow({ lastSyncedDate: "2026-10-09", yesterday: "2026-10-03" });
    expect(window).toMatchObject({ since: "2026-09-27", until: "2026-10-03", reason: "refresh" });
  });

  it("will not let an unattended run reach back further than its bound", () => {
    // A year-old last-synced date must not turn one nightly run into a
    // year of paginated API calls inside a 50-second budget.
    const window = spendSyncWindow({ lastSyncedDate: "2024-01-01", yesterday: "2026-10-03" });
    expect(window).toMatchObject({
      since: "2026-07-06",
      days: DEFAULT_BACKFILL_DAYS,
      reason: "gap",
    });
  });

  it("honours an explicit backfill past the bound, because somebody asked for it", () => {
    const window = spendSyncWindow({
      lastSyncedDate: "2026-10-02",
      yesterday: "2026-10-03",
      requestedDays: 365,
    });
    expect(window).toEqual({
      since: "2025-10-04",
      until: "2026-10-03",
      days: 365,
      reason: "requested",
    });
  });

  it("ignores a nonsense ?days= rather than syncing backwards", () => {
    const base = { lastSyncedDate: "2026-09-30", yesterday: "2026-10-03" };
    expect(spendSyncWindow({ ...base, requestedDays: 0 })).toMatchObject({ reason: "refresh" });
    expect(spendSyncWindow({ ...base, requestedDays: -5 })).toMatchObject({ reason: "refresh" });
    expect(spendSyncWindow({ ...base, requestedDays: Number.NaN })).toMatchObject({
      reason: "refresh",
    });
  });

  it("counts a single day as one day, not nought", () => {
    const window = spendSyncWindow({
      lastSyncedDate: null,
      yesterday: "2026-10-03",
      maxBackfillDays: 1,
    });
    expect(window).toEqual({
      since: "2026-10-03",
      until: "2026-10-03",
      days: 1,
      reason: "first-run",
    });
  });

  it("crosses a month and a year boundary correctly", () => {
    const window = spendSyncWindow({
      lastSyncedDate: "2025-11-30",
      yesterday: "2026-01-02",
      lookbackDays: 1,
    });
    expect(window).toMatchObject({ since: "2025-11-30", until: "2026-01-02", days: 34 });
  });
});

/**
 * The nightly window walks forward from the newest day stored. The
 * backfill button walks BACKWARD from the oldest, because that is the
 * question somebody with a year of history actually has: not "what is
 * missing since yesterday" but "how far back does this go".
 */
describe("backfillWindow", () => {
  it("starts with the ordinary ninety days when nothing is stored", () => {
    // A first press on a fresh instance should not reach three years
    // back; it should do what the nightly run would have done.
    expect(backfillWindow({ earliestStored: null, yesterday: "2026-10-03" })).toMatchObject({
      since: "2026-07-06",
      until: "2026-10-03",
      days: DEFAULT_BACKFILL_CHUNK_DAYS,
    });
  });

  it("fetches the ninety days immediately before what is already stored", () => {
    expect(backfillWindow({ earliestStored: "2026-07-06", yesterday: "2026-10-03" })).toMatchObject({
      since: "2026-04-07",
      until: "2026-07-05",
      days: 90,
    });
  });

  it("never overlaps what is stored, so four presses are four distinct windows", () => {
    let earliest: string | null = null;
    const windows: Array<{ since: string; until: string }> = [];
    for (let press = 0; press < 4; press += 1) {
      const window = backfillWindow({ earliestStored: earliest, yesterday: "2026-10-03" });
      if (!window) break;
      windows.push({ since: window.since, until: window.until });
      earliest = window.since;
    }

    expect(windows).toHaveLength(4);
    // 4 × 90 = 360 days back from yesterday, with no day fetched twice
    // and no gap between the chunks.
    expect(windows[3].since).toBe("2025-10-09");
    for (let i = 1; i < windows.length; i += 1) {
      const previousSince = new Date(`${windows[i - 1].since}T00:00:00Z`).getTime();
      const thisUntil = new Date(`${windows[i].until}T00:00:00Z`).getTime();
      expect(previousSince - thisUntil).toBe(86_400_000);
    }
  });

  it("stops at the history horizon rather than letting the button be pressed for ever", () => {
    // Meta keeps ad insights for about 37 months; past that there is
    // nothing to fetch and a button that always works is one somebody
    // keeps pressing.
    expect(
      backfillWindow({ earliestStored: "2023-01-01", yesterday: "2026-10-03" }),
    ).toBeNull();
  });

  it("clips the last chunk to the horizon instead of overshooting it", () => {
    const window = backfillWindow({
      earliestStored: "2026-09-04",
      yesterday: "2026-10-03",
      maxHistoryDays: 60,
    });
    expect(window).toMatchObject({ since: "2026-08-05", until: "2026-09-03", days: 30 });
  });
});
