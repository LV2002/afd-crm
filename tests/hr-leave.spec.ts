import { describe, expect, it } from "vitest";

import {
  countLeaveDays,
  entitlement,
  inProbation,
  leaveBalance,
  ordinal,
  rangesOverlap,
  type LeavePolicy,
} from "../src/lib/hr/leave";

const POLICY: LeavePolicy = {
  annualSick: 6,
  annualCasual: 6,
  joiningMonthCounts: true,
  probationMonths: 6,
  probationPaidPerMonth: 1,
  weeklyOff: [0],
};

describe("entitlement", () => {
  // The table from the payroll brief: total = 13 - joining month, half sick and half casual.
  const table: Array<[string, number]> = [
    ["01", 6], ["02", 5.5], ["03", 5], ["04", 4.5], ["05", 4], ["06", 3.5],
    ["07", 3], ["08", 2.5], ["09", 2], ["10", 1.5], ["11", 1], ["12", 0.5],
  ];
  for (const [month, sick] of table) {
    it(`gives ${sick} sick days to somebody who joined in month ${month}`, () => {
      expect(entitlement(6, `2026-${month}-10`, 2026, true)).toBe(sick);
    });
  }

  it("gives the full year to somebody who joined earlier, or who has no joining date", () => {
    expect(entitlement(6, "2025-11-01", 2026, true)).toBe(6);
    expect(entitlement(6, null, 2026, true)).toBe(6);
  });

  it("gives nothing to somebody who has not joined yet", () => {
    expect(entitlement(6, "2027-02-01", 2026, true)).toBe(0);
  });

  it("drops a month when the joining month does not count", () => {
    expect(entitlement(6, "2026-03-10", 2026, false)).toBe(4.5);
  });
});

describe("counting leave days", () => {
  const none = new Set<string>();
  it("skips the weekly off", () => {
    // Mon 2 Nov to Sun 8 Nov 2026
    expect(countLeaveDays("casual", "2026-11-02", "2026-11-08", none, [0])).toBe(6);
  });
  it("skips company holidays", () => {
    expect(countLeaveDays("casual", "2026-11-02", "2026-11-04", new Set(["2026-11-03"]), [0])).toBe(2);
  });
  it("counts a half day as 0.5, but not on a day off", () => {
    expect(countLeaveDays("half_day", "2026-11-03", "2026-11-03", none, [0])).toBe(0.5);
    expect(countLeaveDays("half_day", "2026-11-08", "2026-11-08", none, [0])).toBe(0);
  });
});

describe("balances", () => {
  const long = { dateOfJoining: "2020-01-01", openingSl: null, openingCl: null, openingAsOf: null };
  const none = new Set<string>();

  it("resets on 1 January: December leave does not reduce next year", () => {
    const requests = [{ kind: "sick" as const, fromDate: "2026-12-01", toDate: "2026-12-03", status: "approved" as const }];
    const dec = leaveBalance({ employee: long, year: 2026, policy: POLICY, requests, holidays: none });
    const jan = leaveBalance({ employee: long, year: 2027, policy: POLICY, requests, holidays: none });
    expect(dec.sick.remaining).toBe(3);
    expect(jan.sick.remaining).toBe(6);
    expect(jan.casual.remaining).toBe(6);
  });

  it("counts only approved leave as used, and shows pending separately", () => {
    const b = leaveBalance({
      employee: long, year: 2026, policy: POLICY, holidays: none,
      requests: [
        { kind: "casual", fromDate: "2026-03-02", toDate: "2026-03-02", status: "approved" },
        { kind: "casual", fromDate: "2026-03-09", toDate: "2026-03-10", status: "pending" },
        { kind: "casual", fromDate: "2026-03-16", toDate: "2026-03-16", status: "rejected" },
      ],
    });
    expect(b.casual).toMatchObject({ used: 1, pending: 2, remaining: 5 });
  });

  it("shows the excess as overdrawn (it will be loss of pay), never a negative balance", () => {
    const b = leaveBalance({
      employee: long, year: 2026, policy: POLICY, holidays: none,
      requests: [{ kind: "sick", fromDate: "2026-02-02", toDate: "2026-02-10", status: "approved" }],
    });
    expect(b.sick).toMatchObject({ used: 8, remaining: 0, overdrawn: 2 });
  });

  it("starts from the opening balances on an old payslip, and counts only leave after it", () => {
    const b = leaveBalance({
      employee: { dateOfJoining: "2025-06-11", openingSl: 1.5, openingCl: 0.5, openingAsOf: "2026-10-31" },
      year: 2026, policy: POLICY, holidays: none,
      requests: [
        { kind: "sick", fromDate: "2026-10-05", toDate: "2026-10-05", status: "approved" }, // already in the opening figure
        { kind: "sick", fromDate: "2026-11-03", toDate: "2026-11-03", status: "approved" },
      ],
    });
    expect(b.sick).toMatchObject({ entitled: 1.5, used: 1, remaining: 0.5 });
    expect(b.casual.remaining).toBe(0.5);
  });

  it("ignores the opening balance in a later year: the year starts fresh", () => {
    const b = leaveBalance({
      employee: { dateOfJoining: "2025-06-11", openingSl: 1.5, openingCl: 0.5, openingAsOf: "2026-10-31" },
      year: 2027, policy: POLICY, holidays: none, requests: [],
    });
    expect(b.sick.entitled).toBe(6);
  });

  it("totals loss of pay and half days, which use no balance", () => {
    const b = leaveBalance({
      employee: long, year: 2026, policy: POLICY, holidays: none,
      requests: [
        { kind: "lop", fromDate: "2026-04-01", toDate: "2026-04-02", status: "approved" },
        { kind: "half_day", fromDate: "2026-04-06", toDate: "2026-04-06", status: "approved" },
      ],
    });
    expect(b.lopDays).toBe(2.5);
    expect(b.sick.used).toBe(0);
  });
});

describe("helpers", () => {
  it("finds probation by date", () => {
    expect(inProbation("2026-05-04", "2026-10-31", 6)).toBe(true);
    expect(inProbation("2026-05-04", "2026-11-04", 6)).toBe(false);
    expect(inProbation(null, "2026-10-31", 6)).toBe(false);
  });
  it("detects overlapping ranges", () => {
    expect(rangesOverlap("2026-11-02", "2026-11-04", "2026-11-04", "2026-11-06")).toBe(true);
    expect(rangesOverlap("2026-11-02", "2026-11-03", "2026-11-04", "2026-11-06")).toBe(false);
  });
  it("writes ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 14, 21, 22, 23, 30].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "14th", "21st", "22nd", "23rd", "30th",
    ]);
  });
});
