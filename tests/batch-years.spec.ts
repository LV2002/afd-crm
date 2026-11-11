import { describe, expect, it } from "vitest";

import { batchCoversYear, batchYearsLabel } from "../src/lib/enrolment/academic-year";
import { studentYearClauses } from "../src/lib/students/year-filter";

describe("a batch that runs for more than one year", () => {
  it("covers each academic year it runs for, and no other", () => {
    expect(batchCoversYear("2026-27", 2, "2026-27")).toBe(true);
    expect(batchCoversYear("2026-27", 2, "2027-28")).toBe(true);
    expect(batchCoversYear("2026-27", 2, "2028-29")).toBe(false);
    expect(batchCoversYear("2026-27", 2, "2025-26")).toBe(false);
    expect(batchCoversYear("2026-27", 1, "2027-28")).toBe(false);
  });
  it("names the span", () => {
    expect(batchYearsLabel("2026-27", 1)).toBe("2026-27");
    expect(batchYearsLabel("2026-27", 2)).toBe("2026-27 to 2027-28");
  });
  it("puts a second-year student on next year's list through their batch, not their course", () => {
    const clauses = studentYearClauses({
      year: "2027-28",
      batches: [
        { id: "two-year", academic_year: "2026-27", years: 2 },
        { id: "one-year", academic_year: "2026-27", years: 1 },
        { id: "new-intake", academic_year: "2027-28", years: 1 },
      ],
      durations: new Map([["dah", 2], ["short", 1]]),
    });
    const batchClause = clauses.find((c) => c.startsWith("current_batch_id.in."))!;
    expect(batchClause).toBe("current_batch_id.in.(two-year,new-intake)");
    // Somebody with no batch yet is placed by the course's length instead.
    expect(clauses).toContain("and(current_batch_id.is.null,intake_year.eq.2026-27,current_course.in.(dah))");
  });
});
