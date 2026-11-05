import { describe, expect, it } from "vitest";

import { calculatePayslip } from "../src/lib/payroll/calc";
import { renderPayslips, type PdfSlip } from "../src/lib/payroll/pdf";

const rs = (r: number) => Math.round(r * 100);

function slip(n: number): PdfSlip {
  const out = calculatePayslip({
    month: "2026-10",
    settings: { lateAllowanceMin: 60, earlyAllowanceMin: 60, divisor: null, deductionFactor: 0.5 },
    leave: { annualSick: 6, annualCasual: 6, joiningMonthCounts: true, probationMonths: 6, probationPaidPerMonth: 1, weeklyOff: [0] },
    employee: { dateOfJoining: "2020-01-01", designation: "Designer" },
    base: { basic: rs(30000), hra: rs(15000), other: rs(10000), medical: rs(10000) },
    opening: { sl: 6, cl: 6, advancePaise: rs(5000) },
    money: { overtime: 0, arrears: 0, incentives: rs(1000), insurance: 0, bonus: 0, advanceGiven: 0, advanceRepaid: rs(500) },
    entries: [{ date: "2026-10-05", type: "lop" }, { date: "2026-10-06", type: "late", minutes: 100 }],
  });
  if (!out.ok) throw new Error(out.errors.join(";"));
  return {
    slipNo: n,
    result: out.result,
    employee: { empNo: "10085", name: "Anand Raj", designation: "Designer", department: "Design", dateOfJoining: "2020-01-01", address: null, pan: "ABCDE1234F", bankName: "HDFC", bankAccount: "50100012345678", ifsc: "HDFC0001234" },
    company: { name: "afdindia", address: "3rd Floor, MI Arcade, Edapally Toll, Kochi", contactEmail: "accounts@afdindia.com", lateAllowance: 60, earlyAllowance: 60 },
    paid: "Paid Rs. 61,050.47: 1 Nov 2026 from HDFC",
  };
}

describe("payslip PDF", () => {
  it("renders a valid PDF, one page a payslip", async () => {
    const one = await renderPayslips([slip(1)]);
    expect(one.subarray(0, 5).toString()).toBe("%PDF-");
    expect(one.length).toBeGreaterThan(2000);
    const many = await renderPayslips([slip(1), slip(2), slip(3)]);
    expect(many.toString("latin1").match(/\/Type \/Page\b/g)?.length).toBe(3);
  });
});
