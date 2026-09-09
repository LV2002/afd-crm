/**
 * Conversion by one dimension — district, school, board.
 *
 * The rule worth protecting is the refusal to print a percentage for a
 * segment of three. "Two out of three — 67%!" is how a school with one
 * good year becomes a budget line, and the honest answer is to show the
 * counts and withhold the rate.
 */
import { describe, expect, it } from "vitest";

import {
  MIN_FOR_RATE,
  NOT_RECORDED,
  overallRate,
  segmentPerformance,
  standoutSegments,
  type SegmentLead,
} from "../src/lib/reports/segments";

function leads(value: string | null, total: number, admissions: number): SegmentLead[] {
  return Array.from({ length: total }, (_, index) => ({
    leadId: `${value}-${index}`,
    value,
    admitted: index < admissions,
  }));
}

describe("segmentPerformance", () => {
  it("counts leads and admissions per value", () => {
    const [row] = segmentPerformance(leads("Kannur", 10, 3));
    expect(row.value).toBe("Kannur");
    expect(row.leads).toBe(10);
    expect(row.admissions).toBe(3);
    expect(row.conversionRate).toBeCloseTo(0.3);
  });

  it("withholds a rate from a segment too small to mean anything", () => {
    const [row] = segmentPerformance(leads("Wayanad", MIN_FOR_RATE - 1, 2));
    expect(row.conversionRate).toBeNull();
    expect(row.leads).toBe(MIN_FOR_RATE - 1);
    expect(row.admissions).toBe(2);
  });

  it("reports a rate the moment the segment is big enough", () => {
    const [row] = segmentPerformance(leads("Wayanad", MIN_FOR_RATE, 2));
    expect(row.conversionRate).toBeCloseTo(2 / MIN_FOR_RATE);
  });

  it("gathers null and blank values under one honest label", () => {
    const rows = segmentPerformance([
      ...leads(null, 2, 0),
      ...leads("  ", 1, 0),
      ...leads("", 1, 0),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(NOT_RECORDED);
    expect(rows[0].leads).toBe(4);
  });

  it("trims a value rather than splitting it in two", () => {
    const rows = segmentPerformance([...leads("Kochi", 3, 1), ...leads(" Kochi ", 2, 0)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].leads).toBe(5);
  });

  it("scales intensity against the biggest segment", () => {
    const rows = segmentPerformance([...leads("Big", 20, 0), ...leads("Small", 5, 0)]);
    expect(rows[0].intensity).toBe(1);
    expect(rows[1].intensity).toBe(0.25);
  });

  it("sorts by volume, then alphabetically for a tie", () => {
    const rows = segmentPerformance([
      ...leads("Zebra", 4, 0),
      ...leads("Alpha", 4, 0),
      ...leads("Biggest", 9, 0),
    ]);
    expect(rows.map((row) => row.value)).toEqual(["Biggest", "Alpha", "Zebra"]);
  });

  it("returns nothing for no leads", () => {
    expect(segmentPerformance([])).toEqual([]);
  });
});

describe("overallRate", () => {
  it("pools the rows rather than averaging their rates", () => {
    // Averaging the two rates would give 0.3; the honest number is 12/70.
    const rows = segmentPerformance([...leads("A", 10, 5), ...leads("B", 60, 7)]);
    expect(overallRate(rows)).toBeCloseTo(12 / 70);
  });

  it("is zero with nothing to divide", () => {
    expect(overallRate([])).toBe(0);
  });
});

describe("standoutSegments", () => {
  const rows = segmentPerformance([
    ...leads("Star", 20, 12),
    ...leads("Middling", 20, 4),
    ...leads("Poor", 20, 1),
    ...leads("Tiny", 3, 3),
  ]);
  const overall = overallRate(rows);

  it("picks out the segments well above and well below the overall rate", () => {
    const { best, worst } = standoutSegments(rows, overall);
    expect(best.map((row) => row.value)).toContain("Star");
    expect(worst.map((row) => row.value)).toContain("Poor");
  });

  it("leaves the middle alone", () => {
    const { best, worst } = standoutSegments(rows, overall);
    expect([...best, ...worst].map((row) => row.value)).not.toContain("Middling");
  });

  it("never promotes a segment whose rate it refused to report", () => {
    const { best } = standoutSegments(rows, overall);
    expect(best.map((row) => row.value)).not.toContain("Tiny");
  });

  it("shows at most five each way", () => {
    const many = segmentPerformance(
      Array.from({ length: 12 }, (_, index) => leads(`S${index}`, 10, 9)).flat(),
    );
    const { best } = standoutSegments(many, 0.1);
    expect(best).toHaveLength(5);
  });
});
