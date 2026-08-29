import { describe, expect, it } from "vitest";

import { computeBusinessHoursElapsed, type DayHours } from "../src/lib/sla/business-hours";

const TZ = "Asia/Kolkata";

// Mon-Fri 09:00-18:00 IST, Sat/Sun closed (no row = closed).
const WEEKDAY_HOURS: DayHours[] = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  opensAt: "09:00:00",
  closesAt: "18:00:00",
  isClosed: false,
}));

describe("computeBusinessHoursElapsed", () => {
  it("returns 0 for end <= start", () => {
    const t = new Date("2026-08-24T10:00:00Z"); // Monday 15:30 IST
    expect(computeBusinessHoursElapsed(t, t, WEEKDAY_HOURS, new Set(), TZ)).toBe(0);
  });

  it("counts straight-through hours entirely inside one business day", () => {
    // Monday 2026-08-24: 10:00-14:00 IST is 04:30-08:30 UTC.
    const start = new Date("2026-08-24T04:30:00Z");
    const end = new Date("2026-08-24T08:30:00Z");
    expect(computeBusinessHoursElapsed(start, end, WEEKDAY_HOURS, new Set(), TZ)).toBeCloseTo(4, 6);
  });

  it("clips to the day's opening window when start/end fall outside it", () => {
    // Monday 06:00 IST (before opening) to Monday 20:00 IST (after closing) -> only 09:00-18:00 counts = 9h.
    const start = new Date("2026-08-24T00:30:00Z"); // 06:00 IST
    const end = new Date("2026-08-24T14:30:00Z"); // 20:00 IST
    expect(computeBusinessHoursElapsed(start, end, WEEKDAY_HOURS, new Set(), TZ)).toBeCloseTo(9, 6);
  });

  it("skips a fully closed weekend day entirely", () => {
    // Saturday 2026-08-22 all day -> 0 hours, no row for Saturday.
    const start = new Date("2026-08-22T00:00:00Z");
    const end = new Date("2026-08-23T00:00:00Z");
    expect(computeBusinessHoursElapsed(start, end, WEEKDAY_HOURS, new Set(), TZ)).toBe(0);
  });

  it("pauses the clock over a weekend: Friday close to Monday open is 0 extra hours", () => {
    // Friday 2026-08-21 18:00 IST (close) to Monday 2026-08-24 09:00 IST (open) -> 0h business time.
    const fridayClose = new Date("2026-08-21T12:30:00Z"); // 18:00 IST Friday
    const mondayOpen = new Date("2026-08-24T03:30:00Z"); // 09:00 IST Monday
    expect(computeBusinessHoursElapsed(fridayClose, mondayOpen, WEEKDAY_HOURS, new Set(), TZ)).toBe(0);
  });

  it("sums correctly across a full open-to-open week span (5 weekdays x 9h)", () => {
    // Monday 09:00 IST to the following Monday 09:00 IST.
    const start = new Date("2026-08-24T03:30:00Z");
    const end = new Date("2026-08-31T03:30:00Z");
    expect(computeBusinessHoursElapsed(start, end, WEEKDAY_HOURS, new Set(), TZ)).toBeCloseTo(45, 6);
  });

  it("a holiday removes that day's hours even though it's a normal weekday", () => {
    // Monday 2026-08-24 is a holiday: the whole Mon-Tue span should only count Tuesday's 9h.
    const start = new Date("2026-08-24T03:30:00Z"); // Monday 09:00 IST
    const end = new Date("2026-08-25T12:30:00Z"); // Tuesday 18:00 IST
    const result = computeBusinessHoursElapsed(start, end, WEEKDAY_HOURS, new Set(["2026-08-24"]), TZ);
    expect(result).toBeCloseTo(9, 6);
  });

  it("a day-of-week with no configured row at all is treated as closed", () => {
    const sundayOnly: DayHours[] = [{ dayOfWeek: 0, opensAt: "10:00:00", closesAt: "12:00:00", isClosed: false }];
    // Monday, not configured at all -> 0h even though the request spans working hours.
    const start = new Date("2026-08-24T04:30:00Z");
    const end = new Date("2026-08-24T08:30:00Z");
    expect(computeBusinessHoursElapsed(start, end, sundayOnly, new Set(), TZ)).toBe(0);
  });

  it("an explicit isClosed row overrides opensAt/closesAt being present", () => {
    const closedMonday: DayHours[] = [
      { dayOfWeek: 1, opensAt: "09:00:00", closesAt: "18:00:00", isClosed: true },
    ];
    const start = new Date("2026-08-24T04:30:00Z");
    const end = new Date("2026-08-24T08:30:00Z");
    expect(computeBusinessHoursElapsed(start, end, closedMonday, new Set(), TZ)).toBe(0);
  });
});
