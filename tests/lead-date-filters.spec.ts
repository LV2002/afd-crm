/**
 * The leads list's date filters.
 *
 * Every case here is a timezone boundary, because that is the only way
 * these go wrong: the figures look plausible either way, and a filter
 * that quietly drops the first five and a half hours of every month is
 * never noticed from the screen.
 */
import { describe, expect, it } from "vitest";

import { parseLeadDateFilters, recentMonths, startOfTodayIST } from "@/lib/leads/date-filters";

/** 30 September 2026, 14:00 IST — which is 08:30 UTC. */
const NOW = new Date("2026-09-30T08:30:00Z");

describe("parseLeadDateFilters", () => {
  it("reads a whole month as midnight IST to midnight IST", () => {
    const filters = parseLeadDateFilters({ created_month: "2026-09" }, NOW);
    // 1 September 00:00 IST is 31 August 18:30 UTC.
    expect(filters.createdFrom?.toISOString()).toBe("2026-08-31T18:30:00.000Z");
    expect(filters.createdTo?.toISOString()).toBe("2026-09-30T18:30:00.000Z");
  });

  it("includes the whole of the day named in a to-date", () => {
    // 1st to 1st is one whole day, not nothing.
    const filters = parseLeadDateFilters(
      { created_from: "2026-09-01", created_to: "2026-09-01" },
      NOW,
    );
    expect(filters.createdFrom?.toISOString()).toBe("2026-08-31T18:30:00.000Z");
    expect(filters.createdTo?.toISOString()).toBe("2026-09-01T18:30:00.000Z");
  });

  it("lets a month beat a pair of dates", () => {
    const filters = parseLeadDateFilters(
      { created_month: "2026-07", created_from: "2026-01-01", created_to: "2026-12-31" },
      NOW,
    );
    expect(filters.createdFrom?.toISOString()).toBe("2026-06-30T18:30:00.000Z");
    expect(filters.createdTo?.toISOString()).toBe("2026-07-31T18:30:00.000Z");
  });

  it("ignores anything that is not a date", () => {
    const filters = parseLeadDateFilters(
      { created_from: "yesterday", created_month: "September", followup_to: "2026-13-45x" },
      NOW,
    );
    expect(filters.createdFrom).toBeNull();
    expect(filters.createdTo).toBeNull();
    expect(filters.followupTo).toBeNull();
    expect(filters.active).toBe(false);
  });

  it("treats overdue as everything before midnight IST this morning", () => {
    const filters = parseLeadDateFilters({ followup: "overdue" }, NOW);
    expect(filters.followupTo?.toISOString()).toBe("2026-09-29T18:30:00.000Z");
    // No lower bound: a follow-up booked last March and never done is the
    // most overdue thing there is.
    expect(filters.followupFrom).toBeNull();
    expect(filters.excludeTerminalStages).toBe(true);
  });

  it("does not exclude won and lost leads for any filter but overdue", () => {
    expect(parseLeadDateFilters({ followup: "today" }, NOW).excludeTerminalStages).toBe(false);
    expect(parseLeadDateFilters({ followup: "week" }, NOW).excludeTerminalStages).toBe(false);
    expect(parseLeadDateFilters({ followup: "none" }, NOW).excludeTerminalStages).toBe(false);
  });

  it("reads today as the IST day, not the UTC one", () => {
    // 01:00 IST on 1 October is 19:30 UTC on 30 September. "Today" has to
    // be the 1st.
    const lateEvening = new Date("2026-09-30T19:30:00Z");
    const filters = parseLeadDateFilters({ followup: "today" }, lateEvening);
    expect(filters.followupFrom?.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(filters.followupTo?.toISOString()).toBe("2026-10-01T18:30:00.000Z");
  });

  it("reads 'no follow-up booked' as a null check rather than a range", () => {
    const filters = parseLeadDateFilters({ followup: "none" }, NOW);
    expect(filters.followupMissing).toBe(true);
    expect(filters.followupFrom).toBeNull();
    expect(filters.followupTo).toBeNull();
    expect(filters.active).toBe(true);
  });
});

describe("startOfTodayIST", () => {
  it("is midnight in Kochi, not in UTC", () => {
    expect(startOfTodayIST(NOW).toISOString()).toBe("2026-09-29T18:30:00.000Z");
  });
});

describe("recentMonths", () => {
  it("counts back from this month in IST", () => {
    const months = recentMonths(NOW, 3);
    expect(months.map((m) => m.value)).toEqual(["2026-09", "2026-08", "2026-07"]);
    expect(months[0].label).toBe("September 2026");
  });

  it("crosses a year boundary", () => {
    const months = recentMonths(new Date("2026-01-15T08:30:00Z"), 3);
    expect(months.map((m) => m.value)).toEqual(["2026-01", "2025-12", "2025-11"]);
  });
});
