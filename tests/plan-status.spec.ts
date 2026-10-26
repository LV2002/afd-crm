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
  it("splits what is left after the down payment, a month apart", () => {
    const lines = suggestSchedule({
      netPaise: 4000000,
      downPaymentPaise: 1000000,
      count: 3,
      startDate: "2026-11-01",
    });
    expect(lines.map((l) => l.amountPaise)).toEqual([1000000, 1000000, 1000000]);
    expect(lines.map((l) => l.dueDate)).toEqual(["2026-11-01", "2026-12-01", "2027-01-01"]);
  });

  it("lets the last instalment absorb rounding", () => {
    const lines = suggestSchedule({ netPaise: 1000001, downPaymentPaise: 0, count: 3, startDate: "2026-11-01" });
    expect(lines.reduce((s, l) => s + l.amountPaise, 0)).toBe(1000001);
    expect(lines).toHaveLength(3);
  });

  it("has no instalments for a lump sum (down payment is the whole fee)", () => {
    expect(suggestSchedule({ netPaise: 500000, downPaymentPaise: 500000, count: 3, startDate: "2026-11-01" })).toEqual([]);
  });

  it("returns nothing when there is nothing payable", () => {
    expect(suggestSchedule({ netPaise: 0, downPaymentPaise: 0, count: 3, startDate: "2026-11-01" })).toEqual([]);
  });
});

describe("planStatus", () => {
  const instalments = [
    { sequence: 1, dueDate: "2026-11-01", amountPaise: 1000000 },
    { sequence: 2, dueDate: "2026-12-01", amountPaise: 1000000 },
  ];

  it("is ready when down payment plus instalments equal the payable amount", () => {
    expect(planStatus({ netPaise: 2000000, instalments, paidPaise: 0, asOf: "2026-10-26" }).ready).toBe(true);
    expect(
      planStatus({ netPaise: 2500000, downPaymentPaise: 500000, instalments, paidPaise: 0, asOf: "2026-10-26" }).ready,
    ).toBe(true);
    expect(planStatus({ netPaise: 2500000, instalments, paidPaise: 0, asOf: "2026-10-26" }).ready).toBe(false);
  });

  it("treats a lump sum entered as a down payment as a complete plan", () => {
    const status = planStatus({
      netPaise: 3000000,
      downPaymentPaise: 3000000,
      downPaymentDueDate: "2026-10-26",
      instalments: [],
      paidPaise: 0,
      asOf: "2026-10-26",
    });
    expect(status.ready).toBe(true);
    expect(status.nextDue).toEqual({ sequence: 0, dueDate: "2026-10-26", amountPaise: 3000000, outstandingPaise: 3000000, overdue: false });
  });

  it("chases the down payment before the first instalment", () => {
    const status = planStatus({
      netPaise: 2500000,
      downPaymentPaise: 500000,
      downPaymentDueDate: "2026-10-26",
      instalments,
      paidPaise: 600000,
      asOf: "2026-10-27",
    });
    expect(status.nextDue).toMatchObject({ sequence: 1, amountPaise: 1000000 });
  });

  it("finds the next unpaid instalment and whether it is overdue", () => {
    const status = planStatus({ netPaise: 2000000, instalments, paidPaise: 1000000, asOf: "2026-12-05" });
    expect(status.nextDue).toEqual({ sequence: 2, dueDate: "2026-12-01", amountPaise: 1000000, outstandingPaise: 1000000, overdue: true });
  });

  it("has no next due once everything is paid", () => {
    expect(planStatus({ netPaise: 2000000, instalments, paidPaise: 2000000, asOf: "2026-12-05" }).nextDue).toBeNull();
  });
});

import { allocateWithDownPayment, DOWN_PAYMENT_ID } from "../src/lib/finance/allocate";

describe("allocateWithDownPayment", () => {
  const instalments = [
    { id: "i1", sequence: 1, dueDate: "2026-11-01", amountPaise: 1000000 },
    { id: "i2", sequence: 2, dueDate: "2026-12-01", amountPaise: 1000000 },
  ];

  it("settles the down payment before instalment 1", () => {
    const result = allocateWithDownPayment(
      instalments,
      500000,
      "2026-10-26",
      [{ id: "p1", receivedOn: "2026-10-26", amountPaise: 600000 }],
      "2026-10-27",
    );
    expect(result.instalments[0].id).toBe(DOWN_PAYMENT_ID);
    expect(result.instalments[0].outstandingPaise).toBe(0);
    expect(result.instalments[1].paidPaise).toBe(100000);
    expect(result.outstandingPaise).toBe(2500000 - 600000);
  });

  it("owes the whole fee for a lump sum nobody has paid yet (still owed is not zero)", () => {
    const result = allocateWithDownPayment([], 3000000, "2026-10-26", [], "2026-10-26");
    expect(result.paidPaise).toBe(0);
    expect(result.outstandingPaise).toBe(3000000);
  });
});
