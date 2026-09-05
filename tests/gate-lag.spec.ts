/**
 * How long an admission takes to clear the two handover gates.
 *
 * The arithmetic here is the sort that looks right and is wrong. One
 * admission confirmed in March and paid in November drags a mean into
 * uselessness, and an institute reading "average 41 days" concludes its
 * handovers are broken when half of them clear the same week.
 */
import { describe, expect, it } from "vitest";

import {
  daysBetween,
  describeLag,
  groupGates,
  lagStats,
  summariseGates,
  waitBand,
  type GateRow,
} from "../src/lib/reports/gate-lag";

const ASOF = "2026-04-01T00:00:00.000Z";

function row(overrides: Partial<GateRow> = {}): GateRow {
  return {
    enrolmentId: "e1",
    centerName: "Kochi",
    course: "Foundation",
    counsellorName: "Athira",
    studentName: "Anjali",
    enquiredAt: "2026-03-01T00:00:00.000Z",
    salesToAccountsAt: "2026-03-11T00:00:00.000Z",
    accountsToAcademicsAt: "2026-03-13T00:00:00.000Z",
    droppedAt: null,
    ...overrides,
  };
}

describe("daysBetween", () => {
  it("counts whole days", () => {
    expect(daysBetween("2026-03-01T00:00:00Z", "2026-03-13T00:00:00Z")).toBe(12);
  });

  it("is null when either end is missing", () => {
    expect(daysBetween(null, ASOF)).toBeNull();
    expect(daysBetween(ASOF, null)).toBeNull();
    expect(daysBetween("not a date", ASOF)).toBeNull();
  });

  it("never goes negative", () => {
    // Clock skew or a hand-edited timestamp must not produce "-3 days to
    // pay", which reads as a bug in the report rather than in the data.
    expect(daysBetween("2026-03-13T00:00:00Z", "2026-03-01T00:00:00Z")).toBe(0);
  });
});

describe("lagStats", () => {
  it("reports the median, not just the mean", () => {
    // Nine admissions cleared in 2 days and one took 300. The mean says
    // 32; the median says 2, and the median is the truth about this
    // institute.
    const stats = lagStats([2, 2, 2, 2, 2, 2, 2, 2, 2, 300])!;
    expect(stats.medianDays).toBe(2);
    expect(stats.meanDays).toBe(31.8);
    expect(stats.maxDays).toBe(300);
  });

  it("names a real value at the percentile, not an interpolated one", () => {
    // "The median admission took 4 days" should name an admission that
    // really took 4 days, not 3.5 that nobody experienced.
    const stats = lagStats([1, 4, 9])!;
    expect(stats.medianDays).toBe(4);
  });

  it("surfaces the slow tail separately", () => {
    const stats = lagStats([1, 1, 1, 1, 1, 1, 1, 1, 1, 40])!;
    expect(stats.medianDays).toBe(1);
    expect(stats.p90Days).toBe(1);
    expect(stats.maxDays).toBe(40);
  });

  it("is null rather than zero when there is nothing to measure", () => {
    // Zero days would read as "instant handovers", which is the opposite
    // of "we have never done one".
    expect(lagStats([])).toBeNull();
  });
});

describe("summariseGates", () => {
  it("measures each leg of the journey", () => {
    const summary = summariseGates([row()], ASOF);
    expect(summary.enquiryToConfirmed?.medianDays).toBe(10);
    expect(summary.confirmedToPaid?.medianDays).toBe(2);
    expect(summary.enquiryToPaid?.medianDays).toBe(12);
  });

  it("ignores an enrolment that never reached the first gate", () => {
    // Not yet confirmed is not a slow handover — it is sales work still
    // in progress, and counting it would make the pipeline look like a
    // finance problem.
    const summary = summariseGates([row({ salesToAccountsAt: null })], ASOF);
    expect(summary.confirmedToPaid).toBeNull();
    expect(summary.stuck).toEqual([]);
  });

  it("lists who is confirmed but unpaid, worst wait first", () => {
    // The half of this report that earns its place: not a statistic, a
    // list of people to ring today.
    const summary = summariseGates(
      [
        row({ enrolmentId: "a", studentName: "Recent", salesToAccountsAt: "2026-03-30T00:00:00Z", accountsToAcademicsAt: null }),
        row({ enrolmentId: "b", studentName: "Ancient", salesToAccountsAt: "2026-02-01T00:00:00Z", accountsToAcademicsAt: null }),
      ],
      ASOF,
    );
    expect(summary.stuck.map((s) => s.studentName)).toEqual(["Ancient", "Recent"]);
    expect(summary.stuck[0].waitingDays).toBe(59);
  });

  it("counts a dropped admission separately instead of listing it to chase", () => {
    // Somebody who left is not somebody to ring about a payment.
    const summary = summariseGates(
      [row({ accountsToAcademicsAt: null, droppedAt: "2026-03-20T00:00:00Z" })],
      ASOF,
    );
    expect(summary.stuck).toEqual([]);
    expect(summary.droppedBeforePaying).toBe(1);
  });

  it("still measures the gate lag when the enquiry date is missing", () => {
    // A lead imported without its original enquiry still has both gate
    // timestamps, and the gate lag is the metric that matters.
    const summary = summariseGates([row({ enquiredAt: null })], ASOF);
    expect(summary.confirmedToPaid?.medianDays).toBe(2);
    expect(summary.enquiryToConfirmed).toBeNull();
  });
});

describe("groupGates", () => {
  it("splits the same measure by centre, slowest first", () => {
    const rows = [
      row({ centerName: "Kochi", salesToAccountsAt: "2026-03-01T00:00:00Z", accountsToAcademicsAt: "2026-03-10T00:00:00Z" }),
      row({ centerName: "Kannur", salesToAccountsAt: "2026-03-01T00:00:00Z", accountsToAcademicsAt: "2026-03-03T00:00:00Z" }),
    ];
    const grouped = groupGates(rows, ASOF, (r) => r.centerName);
    expect(grouped.map((g) => g.key)).toEqual(["Kochi", "Kannur"]);
    expect(grouped[0].confirmedToPaid?.medianDays).toBe(9);
  });

  it("buckets a missing counsellor rather than dropping the row", () => {
    const grouped = groupGates([row({ counsellorName: null })], ASOF, (r) => r.counsellorName);
    expect(grouped[0].key).toBe("Unassigned");
  });
});

describe("waitBand and describeLag", () => {
  it("bands a wait coarsely, because 8 versus 7 is not the argument to have", () => {
    expect(waitBand(0)).toBe("fresh");
    expect(waitBand(3)).toBe("fresh");
    expect(waitBand(4)).toBe("slipping");
    expect(waitBand(14)).toBe("slipping");
    expect(waitBand(15)).toBe("stale");
  });

  it("mentions the slow tail only when it actually differs from the median", () => {
    expect(describeLag(lagStats([2, 2, 2, 2, 2, 2, 2, 2, 2, 2]))).toBe("2 days");
    expect(describeLag(lagStats([1, 1, 1, 1, 1, 1, 1, 1, 20, 20]))).toContain("slowest tenth");
    expect(describeLag(null)).toBe("No data yet");
  });

  it("says one day, not one days", () => {
    expect(describeLag(lagStats([1]))).toBe("1 day");
  });
});
