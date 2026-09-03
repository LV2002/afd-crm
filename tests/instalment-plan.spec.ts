/**
 * Instalment plan arithmetic. Pure — no database.
 *
 * This is the money code a printed agreement is generated from, so the
 * rounding and the validation boundaries are pinned rather than assumed.
 */
import { describe, expect, it } from "vitest";

import { planTotals, rupeesToPaise, validatePlan } from "../src/lib/enrolment/instalment-plan";

describe("rupeesToPaise", () => {
  it("converts whole rupees", () => {
    expect(rupeesToPaise("45000")).toBe(4_500_000);
  });

  it("accepts the separators and symbols a person actually types", () => {
    expect(rupeesToPaise("45,000")).toBe(4_500_000);
    expect(rupeesToPaise(" ₹45,000 ")).toBe(4_500_000);
  });

  it("keeps paise exactly, without float drift", () => {
    // 1234.56 * 100 is 123455.99999999999 in binary floating point;
    // truncating would silently lose a paisa.
    expect(rupeesToPaise("1234.56")).toBe(123_456);
    expect(rupeesToPaise("0.07")).toBe(7);
  });

  it("rejects anything that isn't a plain amount, rather than storing a zero", () => {
    expect(rupeesToPaise("")).toBeNull();
    expect(rupeesToPaise("abc")).toBeNull();
    expect(rupeesToPaise("-500")).toBeNull();
    expect(rupeesToPaise("100.999")).toBeNull();
  });
});

describe("planTotals", () => {
  it("computes net and the shortfall against the schedule", () => {
    const totals = planTotals(4_500_000, 500_000, [
      { sequence: 1, dueDate: "2026-06-01", amountPaise: 2_000_000 },
      { sequence: 2, dueDate: "2026-09-01", amountPaise: 1_000_000 },
    ]);
    expect(totals.netFeePaise).toBe(4_000_000);
    expect(totals.scheduledPaise).toBe(3_000_000);
    expect(totals.unscheduledPaise).toBe(1_000_000);
    expect(totals.isFullyScheduled).toBe(false);
  });

  it("reports a fully scheduled plan", () => {
    const totals = planTotals(4_000_000, 0, [
      { sequence: 1, dueDate: "2026-06-01", amountPaise: 2_500_000 },
      { sequence: 2, dueDate: "2026-09-01", amountPaise: 1_500_000 },
    ]);
    expect(totals.isFullyScheduled).toBe(true);
    expect(totals.unscheduledPaise).toBe(0);
  });
});

describe("validatePlan", () => {
  const ok = [{ sequence: 1, dueDate: "2026-06-01", amountPaise: 1_000_000 }];

  it("accepts a valid plan", () => {
    expect(validatePlan(4_000_000, 0, ok)).toEqual([]);
  });

  it("allows a part-scheduled plan", () => {
    // Deliberate: a student pays something now and the rest is agreed
    // later. Refusing this would push counsellors into inventing a fake
    // instalment; the UI shows the shortfall instead.
    expect(validatePlan(4_000_000, 0, ok)).toEqual([]);
  });

  it("rejects scheduling more than is payable", () => {
    // Always a typo, and it would print an agreement overcharging a student.
    const problems = validatePlan(1_000_000, 0, [
      { sequence: 1, dueDate: "2026-06-01", amountPaise: 900_000 },
      { sequence: 2, dueDate: "2026-07-01", amountPaise: 900_000 },
    ]);
    expect(problems.join(" ")).toMatch(/more than the amount payable/);
  });

  it("rejects a discount larger than the fee", () => {
    expect(validatePlan(100_000, 200_000, []).join(" ")).toMatch(/more than the course fee/);
  });

  it("rejects a missing or zero fee", () => {
    expect(validatePlan(0, 0, []).join(" ")).toMatch(/Enter the course fee/);
  });

  it("rejects an instalment with no amount or a malformed date", () => {
    expect(
      validatePlan(4_000_000, 0, [{ sequence: 1, dueDate: "2026-06-01", amountPaise: 0 }]).join(" "),
    ).toMatch(/needs an amount/);
    expect(
      validatePlan(4_000_000, 0, [{ sequence: 1, dueDate: "01/06/2026", amountPaise: 100 }]).join(" "),
    ).toMatch(/needs a due date/);
  });

  it("rejects a duplicated instalment number", () => {
    const problems = validatePlan(4_000_000, 0, [
      { sequence: 1, dueDate: "2026-06-01", amountPaise: 100 },
      { sequence: 1, dueDate: "2026-07-01", amountPaise: 100 },
    ]);
    expect(problems.join(" ")).toMatch(/listed twice/);
  });
});
