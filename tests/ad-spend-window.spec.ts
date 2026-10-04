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
