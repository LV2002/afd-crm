import { describe, expect, it } from "vitest";

import type { LeavePolicy } from "../src/lib/hr/leave";
import {
  calculatePayslip,
  resolveOpening,
  type PayrollEntry,
  type PayrollInput,
  type PayrollResult,
} from "../src/lib/payroll/calc";

const LEAVE: LeavePolicy = {
  annualSick: 6, annualCasual: 6, joiningMonthCounts: true, probationMonths: 6, probationPaidPerMonth: 1, weeklyOff: [0],
};
const SETTINGS = { lateAllowanceMin: 60, earlyAllowanceMin: 60, divisor: null, deductionFactor: 0.5 };
const ZERO = { overtime: 0, arrears: 0, incentives: 0, insurance: 0, bonus: 0, advanceGiven: 0, advanceRepaid: 0 };
const rs = (r: number) => Math.round(r * 100);

function input(over: Partial<PayrollInput> = {}): PayrollInput {
  return {
    month: "2026-10",
    settings: SETTINGS,
    leave: LEAVE,
    employee: { dateOfJoining: "2020-01-01", designation: "Designer" },
    base: { basic: rs(30000), hra: rs(15000), other: rs(10000), medical: rs(10000) }, // gross 65,000
    opening: { sl: 6, cl: 6, advancePaise: 0 },
    money: ZERO,
    entries: [],
    ...over,
  };
}

function run(over: Partial<PayrollInput> = {}): PayrollResult {
  const out = calculatePayslip(input(over));
  if (!out.ok) throw new Error(out.errors.join("; "));
  return out.result;
}

const e = (date: string, type: PayrollEntry["type"], minutes?: number): PayrollEntry => ({ date, type, minutes });

describe("the worked examples in the brief", () => {
  it("A: a loss of pay day and 100 minutes late in a 31-day month", () => {
    const r = run({ entries: [e("2026-10-05", "lop"), e("2026-10-06", "late", 100)] });
    expect(r.lines.lop).toBe(rs(2096.77));
    expect(r.late.amount).toBe(rs(1352.76));
    expect(r.net).toBe(rs(61550.47));
  });

  it("B: a promotion on the 11th blends the month (30 days)", () => {
    const r = run({
      month: "2026-11",
      base: { basic: rs(30000), hra: 0, other: 0, medical: 0 },
      revision: { effectiveDate: "2026-11-11", newComponents: { basic: rs(36000) } },
    });
    expect(r.components.basic).toBe(rs(34000));
    expect(r.breakupNote).toBe("revised from 11th");
  });

  it("C: joining on the 15th of a 30-day month pays 16 of 30 days", () => {
    const r = run({
      month: "2026-11",
      employee: { dateOfJoining: "2026-11-15", designation: "Designer" },
      base: { basic: rs(30000), hra: 0, other: 0, medical: 0 },
    });
    expect(r.components.basic).toBe(rs(16000));
    expect(r.breakupNote).toBe("joined 15th: paid 16 of 30 days");
  });
});

describe("leave", () => {
  it("pays leave from the balance and takes the balance down", () => {
    const r = run({ entries: [e("2026-10-05", "sick"), e("2026-10-06", "casual")] });
    expect(r.leave.slClosing).toBe(5);
    expect(r.leave.clClosing).toBe(5);
    expect(r.lines.lop).toBe(0);
  });

  it("turns a leave with no balance into loss of pay, and says why", () => {
    const r = run({ opening: { sl: 0, cl: 6, advancePaise: 0 }, entries: [e("2026-10-05", "sick")] });
    expect(r.leave.treated[0]).toMatchObject({ treatedAs: "lop", reason: "Loss of pay (no sick leave balance)" });
    expect(r.leave.slClosing).toBe(0);
  });

  it("does not use a balance of half a day", () => {
    const r = run({ opening: { sl: 0.5, cl: 6, advancePaise: 0 }, entries: [e("2026-10-05", "sick")] });
    expect(r.leave.treated[0].treatedAs).toBe("lop");
    expect(r.leave.slClosing).toBe(0.5);
  });

  it("probation cap: of two leaves in a month, one is paid and one is loss of pay", () => {
    const r = run({
      employee: { dateOfJoining: "2026-07-06", designation: "Designer" },
      entries: [e("2026-10-05", "casual"), e("2026-10-12", "sick")],
    });
    expect(r.leave.treated[0].treatedAs).toBe("paid_casual");
    expect(r.leave.treated[1]).toMatchObject({ treatedAs: "lop", reason: "Loss of pay (probation: 1 paid leave per month)" });
  });

  it("the probation cap ends with probation", () => {
    const r = run({
      employee: { dateOfJoining: "2026-01-06", designation: "Designer" },
      entries: [e("2026-10-05", "casual"), e("2026-10-12", "sick")],
    });
    expect(r.lines.lop).toBe(0);
  });

  it("a half day is half a day of loss of pay and uses no balance", () => {
    const r = run({ entries: [e("2026-10-05", "half_day")] });
    expect(r.leave.lopDays).toBe(0.5);
    expect(r.leave.slClosing).toBe(6);
    expect(r.lines.lop).toBe(Math.round((0.5 * rs(65000)) / 31));
  });

  it("a blank joining date is long-standing: no probation", () => {
    const r = run({ employee: { dateOfJoining: null, designation: null }, entries: [e("2026-10-05", "casual"), e("2026-10-12", "sick")] });
    expect(r.lines.lop).toBe(0);
  });

  it("refuses two full-day entries on one date", () => {
    const out = calculatePayslip(input({ entries: [e("2026-10-05", "casual"), e("2026-10-05", "lop")] }));
    expect(out.ok).toBe(false);
  });

  it("refuses a date outside the month and late minutes with no minutes", () => {
    expect(calculatePayslip(input({ entries: [e("2026-09-30", "casual")] })).ok).toBe(false);
    expect(calculatePayslip(input({ entries: [e("2026-10-05", "late")] })).ok).toBe(false);
  });
});

describe("revisions", () => {
  const base = { basic: rs(30000), hra: 0, other: 0, medical: 0 };

  it("a promotion on the 1st uses the new salary for the whole month", () => {
    const r = run({ month: "2026-11", base, revision: { effectiveDate: "2026-11-01", newComponents: { basic: rs(36000) } } });
    expect(r.components.basic).toBe(rs(36000));
  });

  it("loss of pay before and after the date uses the right daily rate", () => {
    const r = run({
      month: "2026-11",
      base,
      revision: { effectiveDate: "2026-11-11", newComponents: { basic: rs(36000) } },
      entries: [e("2026-11-05", "lop"), e("2026-11-20", "lop")],
    });
    expect(r.lines.lop).toBe(Math.round(rs(30000) / 30 + rs(36000) / 30));
  });

  it("refuses a revision that changes nothing, and one dated outside the month", () => {
    expect(calculatePayslip(input({ month: "2026-11", base, revision: { effectiveDate: "2026-11-11", newComponents: { basic: rs(30000) } } })).ok).toBe(false);
    expect(calculatePayslip(input({ month: "2026-11", base, revision: { effectiveDate: "2026-12-01", newComponents: { basic: rs(36000) } } })).ok).toBe(false);
  });

  it("is repeatable: the same inputs give the same slip", () => {
    const i = input({ month: "2026-11", base, revision: { effectiveDate: "2026-11-11", newComponents: { basic: rs(36000) } }, entries: [e("2026-11-20", "lop")] });
    expect(calculatePayslip(i)).toEqual(calculatePayslip(i));
  });

  it("a promotion that changes only the designation is allowed and keeps the pay", () => {
    const r = run({ month: "2026-11", base, revision: { effectiveDate: "2026-11-11", newDesignation: "Senior Designer", newComponents: {} } });
    expect(r.designation).toBe("Senior Designer");
    expect(r.components.basic).toBe(rs(30000));
  });
});

describe("late coming, early exit and the divisor", () => {
  it("is free up to the allowance, and early exit has its own allowance", () => {
    const r = run({ entries: [e("2026-10-05", "late", 50), e("2026-10-06", "early", 55)] });
    expect(r.late.amount + r.early.amount).toBe(0);
  });

  it("a fixed divisor replaces the days in the month", () => {
    const r = run({ settings: { ...SETTINGS, divisor: 60 }, entries: [e("2026-10-05", "late", 100)] });
    // 40 excess / 60 * 0.5 = 0.3333 days of a 65,000/31 day
    expect(r.late.amount).toBe(Math.round(((40 / 60) * 0.5 * rs(65000)) / 31));
  });

  it("uses the full-month gross for a joiner, not the prorated one", () => {
    const r = run({
      month: "2026-11",
      employee: { dateOfJoining: "2026-11-15", designation: null },
      entries: [e("2026-11-20", "late", 90)],
    });
    expect(r.late.amount).toBe(Math.round(((30 / 30) * 0.5 * rs(65000)) / 30));
  });
});

describe("advances", () => {
  it("carries the balance and deducts only the repayment from pay", () => {
    const r = run({ opening: { sl: 6, cl: 6, advancePaise: rs(19619.62) }, money: { ...ZERO, advanceRepaid: rs(6539.87) } });
    expect(r.advance.closing).toBe(rs(13079.75));
    expect(r.net).toBe(rs(65000) - rs(6539.87));
  });

  it("an advance given this month does not change this month's pay", () => {
    const r = run({ money: { ...ZERO, advanceGiven: rs(10000) } });
    expect(r.net).toBe(rs(65000));
    expect(r.advance.closing).toBe(rs(10000));
  });

  it("rejects a repayment larger than what is outstanding", () => {
    expect(calculatePayslip(input({ money: { ...ZERO, advanceRepaid: 1 } })).ok).toBe(false);
    expect(calculatePayslip(input({ opening: { sl: 6, cl: 6, advancePaise: 100 }, money: { ...ZERO, advanceGiven: 100, advanceRepaid: 200 } })).ok).toBe(true);
  });
});

describe("the totals", () => {
  it("earnings include the extras; deductions include insurance; net is the difference", () => {
    const r = run({ money: { ...ZERO, overtime: 100, arrears: 200, incentives: 300, bonus: 400, insurance: 50 } });
    expect(r.earnings).toBe(rs(65000) + 1000);
    expect(r.deductions).toBe(50);
    expect(r.net).toBe(rs(65000) + 950);
  });

  it("refuses an employee who had not joined by the end of the month", () => {
    expect(calculatePayslip(input({ employee: { dateOfJoining: "2026-12-01", designation: null } })).ok).toBe(false);
  });
});

describe("opening balances", () => {
  const employee = { dateOfJoining: "2020-01-01", openingSl: null, openingCl: null, openingAsOf: null, openingAdvancePaise: 0 };

  it("resets on 1 January: a December closing gives 6 and 6 in January", () => {
    const o = resolveOpening({ month: "2027-01", previous: { month: "2026-12", sl: 1, cl: 0, advancePaise: 500 }, employee, leave: LEAVE });
    expect(o).toEqual({ sl: 6, cl: 6, advancePaise: 500 });
  });

  it("continues from the previous month within a year", () => {
    const o = resolveOpening({ month: "2026-11", previous: { month: "2026-10", sl: 1.5, cl: 0.5, advancePaise: 0 }, employee, leave: LEAVE });
    expect(o).toEqual({ sl: 1.5, cl: 0.5, advancePaise: 0 });
  });

  it("starts the first slip from the balances brought forward from an old payslip", () => {
    const o = resolveOpening({
      month: "2026-11", previous: null, leave: LEAVE,
      employee: { ...employee, openingSl: 3, openingCl: 2, openingAsOf: "2026-10-31", openingAdvancePaise: 1000 },
    });
    expect(o).toEqual({ sl: 3, cl: 2, advancePaise: 1000 });
  });

  it("starts from the entitlement when there is nothing else, prorated in the joining year", () => {
    const o = resolveOpening({ month: "2026-11", previous: null, leave: LEAVE, employee: { ...employee, dateOfJoining: "2026-07-06" } });
    expect(o.sl).toBe(3);
  });
});

describe("what an employee is told about probation", () => {
  it("counts the approved days probation will turn into loss of pay, month by month", async () => {
    const { probationLopDays } = await import("../src/lib/payroll/calc");
    const days = [
      { date: "2026-10-05", type: "casual" as const },
      { date: "2026-10-12", type: "sick" as const },
      { date: "2026-10-19", type: "sick" as const },
    ];
    // Joined in July: one paid leave a month, so two of October's three are loss of pay.
    expect(probationLopDays({ days, year: 2026, dateOfJoining: "2026-07-06", leave: LEAVE })).toBe(2);
    // Long-standing: none.
    expect(probationLopDays({ days, year: 2026, dateOfJoining: "2020-01-01", leave: LEAVE })).toBe(0);
  });
});
