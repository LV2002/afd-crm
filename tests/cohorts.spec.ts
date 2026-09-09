/**
 * Cohort curves.
 *
 * The failure mode being guarded here is the one that makes cohort
 * reports lie: reporting a thirty-day rate for a cohort that is eleven
 * days old. Every member who has not yet had thirty days to decide is
 * counted as a non-conversion, so the newest month always looks like a
 * collapse and somebody changes something that was working.
 */
import { describe, expect, it } from "vitest";

import {
  COHORT_DAYS,
  cohortCurves,
  decisionWindow,
  type CohortLead,
} from "../src/lib/reports/cohorts";

function lead(arrivedOn: string, admittedOn: string | null = null, leadId = arrivedOn): CohortLead {
  return { leadId, arrivedOn, admittedOn };
}

describe("cohortCurves", () => {
  it("groups by the month of arrival, newest first", () => {
    const rows = cohortCurves(
      [lead("2026-01-04"), lead("2026-03-02"), lead("2026-02-15")],
      "2026-09-01",
    );
    expect(rows.map((row) => row.cohort)).toEqual(["2026-03", "2026-02", "2026-01"]);
  });

  it("reports null, not zero, for a window the cohort has not lived through", () => {
    // Arrived yesterday. Nobody has had seven days.
    const [row] = cohortCurves([lead("2026-08-31")], "2026-09-01");
    expect(row.rates[7]).toBeNull();
    expect(row.rates[90]).toBeNull();
  });

  it("measures the cohort's age from its newest member, not its oldest", () => {
    // The first arrived on the 1st (62 days before) but the last on the
    // 28th (35 days). Sixty days is not knowable yet; thirty is.
    const rows = cohortCurves([lead("2026-07-01"), lead("2026-07-28")], "2026-09-01");
    expect(rows[0].rates[30]).not.toBeNull();
    expect(rows[0].rates[60]).toBeNull();
  });

  it("counts an admission only in the windows it actually closed inside", () => {
    const [row] = cohortCurves(
      [lead("2026-01-01", "2026-01-21"), lead("2026-01-01", null)],
      "2026-09-01",
    );
    expect(row.rates[7]).toBe(0);
    expect(row.rates[14]).toBe(0);
    expect(row.rates[30]).toBe(0.5);
    expect(row.rates[90]).toBe(0.5);
  });

  it("counts a same-day admission at the earliest checkpoint", () => {
    const [row] = cohortCurves([lead("2026-01-01", "2026-01-01")], "2026-09-01");
    expect(row.rates[7]).toBe(1);
  });

  it("counts an admission on the boundary day as inside the window", () => {
    const [row] = cohortCurves([lead("2026-01-01", "2026-01-08")], "2026-09-01");
    expect(row.rates[7]).toBe(1);
  });

  it("keeps the curve cumulative — a later window is never below an earlier one", () => {
    const [row] = cohortCurves(
      [
        lead("2026-01-05", "2026-01-08", "a"),
        lead("2026-01-06", "2026-02-20", "b"),
        lead("2026-01-07", null, "c"),
        lead("2026-01-08", "2026-03-30", "d"),
      ],
      "2026-09-01",
    );
    const values = COHORT_DAYS.map((day) => row.rates[day] ?? 0);
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]).toBeGreaterThanOrEqual(values[index - 1]);
    }
  });

  it("counts every admission in `admitted` however late it landed", () => {
    const [row] = cohortCurves(
      [lead("2026-01-01", "2026-08-01"), lead("2026-01-02", null)],
      "2026-09-01",
    );
    expect(row.size).toBe(2);
    expect(row.admitted).toBe(1);
  });

  it("returns nothing for no leads", () => {
    expect(cohortCurves([], "2026-09-01")).toEqual([]);
  });
});

describe("decisionWindow", () => {
  it("reports the share of admissions closing inside each window", () => {
    const shares = decisionWindow([
      lead("2026-01-01", "2026-01-03", "a"),
      lead("2026-01-01", "2026-01-20", "b"),
      lead("2026-01-01", "2026-05-01", "c"),
      lead("2026-01-01", null, "d"),
    ]);
    expect(shares.find((entry) => entry.day === 7)!.share).toBeCloseTo(1 / 3);
    expect(shares.find((entry) => entry.day === 30)!.share).toBeCloseTo(2 / 3);
    expect(shares.find((entry) => entry.day === 90)!.share).toBeCloseTo(2 / 3);
  });

  it("ignores leads that never converted rather than counting them against the share", () => {
    const shares = decisionWindow([lead("2026-01-01", "2026-01-02"), lead("2026-01-01", null)]);
    expect(shares.every((entry) => entry.share === 1)).toBe(true);
  });

  it("is all zeroes when nobody has converted", () => {
    expect(decisionWindow([lead("2026-01-01")]).every((entry) => entry.share === 0)).toBe(true);
  });
});
