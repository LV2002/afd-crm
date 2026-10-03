/**
 * One spelling of an academic year.
 *
 * `fee_structures` is found by an EXACT match on course, centre, mode and
 * academic year. The admission form offered a fixed list; the Settings
 * form was a free text box with a placeholder. Leon typed `2027` — an
 * entirely reasonable thing to type — and every admission for that course
 * failed with "no fee structure" while the fee structure sat on screen.
 *
 * So the format is pinned here rather than trusted to two forms agreeing.
 */
import { describe, expect, it } from "vitest";

import {
  academicYearOptions,
  currentAcademicStartYear,
  formatAcademicYear,
} from "../src/lib/enrolment/academic-year";

describe("formatAcademicYear", () => {
  it("is the start year, then the last two digits of the next", () => {
    expect(formatAcademicYear(2026)).toBe("2026-27");
    expect(formatAcademicYear(2025)).toBe("2025-26");
  });

  it("pads across a century so the format never changes width", () => {
    expect(formatAcademicYear(2099)).toBe("2099-00");
    expect(formatAcademicYear(2009)).toBe("2009-10");
  });
});

describe("currentAcademicStartYear", () => {
  it("rolls over in April, because enrolment runs ahead of the year", () => {
    expect(currentAcademicStartYear(new Date("2026-04-01T00:00:00Z"))).toBe(2026);
    expect(currentAcademicStartYear(new Date("2026-12-31T00:00:00Z"))).toBe(2026);
  });

  it("counts January to March as the year that is ending", () => {
    expect(currentAcademicStartYear(new Date("2026-02-14T00:00:00Z"))).toBe(2025);
    expect(currentAcademicStartYear(new Date("2026-03-31T00:00:00Z"))).toBe(2025);
  });
});

describe("academicYearOptions", () => {
  const now = new Date("2026-10-03T00:00:00Z");

  it("offers last year, this year and the two ahead", () => {
    expect(academicYearOptions(null, now).map((o) => o.value)).toEqual([
      "2025-26",
      "2026-27",
      "2027-28",
      "2028-29",
    ]);
  });

  it("is the same list the admission form and the fee structure form both read", () => {
    // The whole point: one function, so the two screens cannot drift.
    expect(academicYearOptions(null, now)).toEqual(academicYearOptions(undefined, now));
  });

  it("keeps a stored value that is outside the window, so editing an old row does not rewrite it", () => {
    const options = academicYearOptions("2019-20", now);
    expect(options[0]).toEqual({ value: "2019-20", label: "2019-20 (as stored)" });
    expect(options).toHaveLength(5);
  });

  it("keeps a stored value somebody typed by hand, and marks it", () => {
    // Leon's row said "2027". It must stay visible and selectable rather
    // than silently becoming something else the moment the row is edited.
    const options = academicYearOptions("2027", now);
    expect(options[0]).toEqual({ value: "2027", label: "2027 (as stored)" });
  });

  it("does not duplicate a stored value that is already in the window", () => {
    expect(academicYearOptions("2026-27", now)).toHaveLength(4);
  });
});
