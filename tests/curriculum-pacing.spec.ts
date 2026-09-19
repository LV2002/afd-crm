/**
 * The arithmetic behind "will Foundation finish by mid-November?".
 *
 * Pure functions, no database. The cases are AFD's real shape: a batch
 * that meets twice a week, a teaching deadline in November, Kerala's
 * holidays in the middle of it.
 */
import { describe, expect, it } from "vitest";

import {
  assessPacing,
  countWeeks,
  dayOfWeekIST,
  meetingDates,
  nextDay,
  parseTimeToMinutes,
  slotHours,
  type PlannedBlock,
  type SessionSlot,
} from "@/lib/curriculum/pacing";

const SATURDAY_MORNING: SessionSlot = {
  dayOfWeek: 6,
  startTime: "10:00:00",
  endTime: "13:00:00",
};
const SUNDAY_MORNING: SessionSlot = {
  dayOfWeek: 0,
  startTime: "10:00:00",
  endTime: "13:00:00",
};

function teaching(hours: number): PlannedBlock {
  return { kind: "teaching", hours };
}

describe("parseTimeToMinutes", () => {
  it("reads both the shapes Postgres and a form produce", () => {
    expect(parseTimeToMinutes("10:00")).toBe(600);
    expect(parseTimeToMinutes("10:00:00")).toBe(600);
    expect(parseTimeToMinutes("09:30")).toBe(570);
    expect(parseTimeToMinutes("9:30")).toBe(570);
  });

  it("refuses something that is not a time", () => {
    expect(() => parseTimeToMinutes("morning")).toThrow(/Not a time/);
    expect(() => parseTimeToMinutes("25:00")).toThrow(/Not a time/);
    expect(() => parseTimeToMinutes("10:75")).toThrow(/Not a time/);
  });
});

describe("slotHours", () => {
  it("measures an ordinary slot", () => {
    expect(slotHours(SATURDAY_MORNING)).toBe(3);
    expect(slotHours({ dayOfWeek: 1, startTime: "14:00", endTime: "15:30" })).toBe(1.5);
  });

  it("treats a backwards slot as zero rather than negative", () => {
    // The database constraint refuses these, but a caller assembling a
    // slot from form input reaches here first, and a negative slot would
    // silently shrink the total rather than showing up as a bad row.
    expect(slotHours({ dayOfWeek: 1, startTime: "15:00", endTime: "14:00" })).toBe(0);
  });
});

describe("dayOfWeekIST", () => {
  it("gets the weekday right regardless of where the server is", () => {
    // 15 November 2026 is a Sunday. Parsed at UTC midnight this reads as
    // Saturday for anyone in the Americas, which is the classic bug.
    expect(dayOfWeekIST("2026-11-15")).toBe(0);
    expect(dayOfWeekIST("2026-11-14")).toBe(6);
    expect(dayOfWeekIST("2026-09-19")).toBe(6);
  });

  it("refuses a value that is not an ISO date", () => {
    expect(() => dayOfWeekIST("15/11/2026")).toThrow(/Not a date/);
  });
});

describe("nextDay", () => {
  it("crosses a month and a year boundary", () => {
    expect(nextDay("2026-09-30")).toBe("2026-10-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
  });
});

describe("countWeeks", () => {
  it("counts an inclusive span", () => {
    expect(countWeeks("2026-09-19", "2026-09-25")).toBe(1);
    expect(countWeeks("2026-09-19", "2026-10-02")).toBe(2);
  });

  it("is zero when the end is before the start", () => {
    expect(countWeeks("2026-10-02", "2026-09-19")).toBe(0);
  });
});

describe("meetingDates", () => {
  it("lists the days a weekend batch actually meets", () => {
    const dates = meetingDates(
      [SATURDAY_MORNING, SUNDAY_MORNING],
      "2026-09-19",
      "2026-10-04",
    );
    expect(dates.map((d) => d.date)).toEqual([
      "2026-09-19",
      "2026-09-20",
      "2026-09-26",
      "2026-09-27",
      "2026-10-03",
      "2026-10-04",
    ]);
  });

  it("drops the holidays", () => {
    const dates = meetingDates(
      [SATURDAY_MORNING, SUNDAY_MORNING],
      "2026-09-19",
      "2026-10-04",
      ["2026-09-26", "2026-09-27"],
    );
    expect(dates.map((d) => d.date)).toEqual([
      "2026-09-19",
      "2026-09-20",
      "2026-10-03",
      "2026-10-04",
    ]);
  });

  it("returns two entries for a day the batch meets twice", () => {
    const evening: SessionSlot = { dayOfWeek: 6, startTime: "14:00", endTime: "17:00" };
    const dates = meetingDates([SATURDAY_MORNING, evening], "2026-09-19", "2026-09-19");
    expect(dates).toHaveLength(2);
  });

  it("is empty when the range is backwards or there are no slots", () => {
    expect(meetingDates([SATURDAY_MORNING], "2026-10-04", "2026-09-19")).toEqual([]);
    expect(meetingDates([], "2026-09-19", "2026-10-04")).toEqual([]);
  });

  it("stops rather than spinning on a mistyped end year", () => {
    // "2206" instead of "2026" is one keystroke. Without the guard this
    // walks 65,000 days one at a time.
    const dates = meetingDates([SATURDAY_MORNING], "2026-09-19", "2206-11-15");
    expect(dates.length).toBeGreaterThan(0);
    expect(dates.length).toBeLessThan(300);
  });
});

describe("assessPacing", () => {
  const toMidNovember = {
    slots: [SATURDAY_MORNING, SUNDAY_MORNING],
    fromDate: "2026-09-19",
    teachingEndDate: "2026-11-15",
  };

  it("says a plan fits when it does", () => {
    // 19 Sep and 15 Nov are both weekend days, so the range holds 9 full
    // weekends: 18 sessions of 3 hours = 54.
    const result = assessPacing({ ...toMidNovember, blocks: [teaching(40)] });

    expect(result.hoursAvailable).toBe(54);
    expect(result.hoursRequired).toBe(40);
    expect(result.slackHours).toBe(14);
    expect(result.fits).toBe(true);
    expect(result.extraHoursPerWeekNeeded).toBe(0);
    expect(result.hoursPerWeek).toBe(6);
  });

  it("says a plan does not fit, and by how much a week", () => {
    const result = assessPacing({ ...toMidNovember, blocks: [teaching(70)] });

    expect(result.fits).toBe(false);
    expect(result.slackHours).toBe(-16);
    // 16 hours short over 8.29 weeks, rounded up to a quarter hour.
    expect(result.extraHoursPerWeekNeeded).toBe(2);
  });

  it("counts hours already taught against the plan, not on top of it", () => {
    const mid = assessPacing({
      ...toMidNovember,
      blocks: [teaching(60)],
      hoursAlreadyTaught: 25,
    });
    expect(mid.hoursRequired).toBe(35);
    expect(mid.fits).toBe(true);
  });

  it("never reports negative work remaining when a course has overrun its plan", () => {
    const done = assessPacing({
      ...toMidNovember,
      blocks: [teaching(20)],
      hoursAlreadyTaught: 30,
    });
    expect(done.hoursRequired).toBe(0);
    expect(done.fits).toBe(true);
  });

  it("splits the requirement by kind, so cutting practice is a visible option", () => {
    const result = assessPacing({
      ...toMidNovember,
      blocks: [
        teaching(30),
        { kind: "practice", hours: 12 },
        { kind: "mock_test", hours: 9 },
        { kind: "revision", hours: 6 },
      ],
    });

    expect(result.byKind).toEqual({ teaching: 30, practice: 12, mock_test: 9, revision: 6 });
    expect(result.hoursRequired).toBe(57);
    expect(result.fits).toBe(false);
  });

  it("takes holidays out of what is available", () => {
    const withHolidays = assessPacing({
      ...toMidNovember,
      blocks: [teaching(50)],
      // Diwali weekend: the batch loses both days, so 54 hours becomes 48.
      holidays: ["2026-11-07", "2026-11-08"],
    });

    expect(withHolidays.hoursAvailable).toBe(48);
    expect(withHolidays.fits).toBe(false);
    expect(withHolidays.slackHours).toBe(-2);
  });

  it("reports honestly when a batch has no timings entered yet", () => {
    // The state every batch is in before the coordinator fills the form.
    // Zero available, the full plan required, and no divide-by-zero.
    const result = assessPacing({
      slots: [],
      blocks: [teaching(40)],
      fromDate: "2026-09-19",
      teachingEndDate: "2026-11-15",
    });

    expect(result.hoursAvailable).toBe(0);
    expect(result.sessionsAvailable).toBe(0);
    expect(result.fits).toBe(false);
    expect(Number.isFinite(result.extraHoursPerWeekNeeded)).toBe(true);
    expect(result.extraHoursPerWeekNeeded).toBe(40);
  });

  it("does not leave floating-point dust on the numbers", () => {
    const result = assessPacing({
      ...toMidNovember,
      blocks: [teaching(0.1), teaching(0.2)],
    });
    expect(result.hoursRequired).toBe(0.3);
  });
});
