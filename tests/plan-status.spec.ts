import { describe, expect, it } from "vitest";

import { addMonthsISO, planStatus, suggestSchedule } from "../src/lib/enrolment/plan-status";

describe("addMonthsISO", () => {
  it("clamps to the end of a shorter month", () => {
    expect(addMonthsISO("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonthsISO("2028-01-31", 1)).toBe("2028-02-29");
  });
  it("rolls the year", () => {
    expect(addMonthsISO("2026-11-15", 2)).toBe("2027-01-15");
  });
});

describe("suggestSchedule", () => {
  it("makes the down payment instalment 1 and splits the rest, adding up exactly", () => {
    const lines = suggestSchedule({
      netPaise: 4000000,
      downPaymentPaise: 1000000,
      count: 4,
      startDate: "2026-11-01",
    });
    expect(lines.map((l) => l.amountPaise)).toEqual([1000000, 1000000, 1000000, 1000000]);
    expect(lines.map((l) => l.dueDate)).toEqual([
      "2026-11-01",
      "2026-12-01",
      "2027-01-01",
      "2027-02-01",
    ]);
  });

  it("lets the last instalment absorb rounding", () => {
    const lines = suggestSchedule({ netPaise: 1000001, downPaymentPaise: 0, count: 3, startDate: "2026-11-01" });
    expect(lines.reduce((s, l) => s + l.amountPaise, 0)).toBe(1000001);
    expect(lines).toHaveLength(3);
  });

  it("is one instalment for the whole fee when asked for one", () => {
    const lines = suggestSchedule({ netPaise: 500000, downPaymentPaise: 100000, count: 1, startDate: "2026-11-01" });
    expect(lines).toEqual([{ sequence: 1, dueDate: "2026-11-01", amountPaise: 500000 }]);
  });

  it("returns nothing when there is nothing payable", () => {
    expect(suggestSchedule({ netPaise: 0, downPaymentPaise: 0, count: 3, startDate: "2026-11-01" })).toEqual([]);
  });

  it("caps a down payment at the payable amount", () => {
    const lines = suggestSchedule({ netPaise: 100000, downPaymentPaise: 900000, count: 3, startDate: "2026-11-01" });
    expect(lines.reduce((s, l) => s + l.amountPaise, 0)).toBe(100000);
  });
});

describe("planStatus", () => {
  const instalments = [
    { sequence: 1, dueDate: "2026-11-01", amountPaise: 1000000 },
    { sequence: 2, dueDate: "2026-12-01", amountPaise: 1000000 },
  ];

  it("is ready only when the instalments equal the payable amount", () => {
    expect(planStatus({ netPaise: 2000000, instalments, paidPaise: 0, asOf: "2026-10-26" }).ready).toBe(true);
    expect(planStatus({ netPaise: 2500000, instalments, paidPaise: 0, asOf: "2026-10-26" }).ready).toBe(false);
    expect(planStatus({ netPaise: 0, instalments: [], paidPaise: 0, asOf: "2026-10-26" }).ready).toBe(false);
  });

  it("finds the next unpaid instalment and whether it is overdue", () => {
    const status = planStatus({ netPaise: 2000000, instalments, paidPaise: 1000000, asOf: "2026-12-05" });
    expect(status.nextDue).toEqual({ sequence: 2, dueDate: "2026-12-01", amountPaise: 1000000, overdue: true });
  });

  it("has no next due once everything is paid", () => {
    expect(planStatus({ netPaise: 2000000, instalments, paidPaise: 2000000, asOf: "2026-12-05" }).nextDue).toBeNull();
  });
});
