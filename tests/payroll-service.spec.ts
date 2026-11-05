/**
 * Payroll against a real database: generating in order, regenerating,
 * approval, paying, and the link from a payslip to the bank statement.
 */
import { config as loadEnv } from "dotenv";
import { and, eq, like, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const { db } = await import("../src/lib/db/client");
const { centers, employeePay, employees, financeAccounts, financeTransactions, leaveRequests, payslips, bankStatementLines } = await import("../src/lib/db/schema");
const { saveStatementLines } = await import("../src/lib/finance/bank-ledger");
const { reverseTransaction } = await import("../src/lib/finance/post");
const { autoMatchAccount } = await import("../src/lib/finance/reconcile");
const { approvePayslip, generatePayslip, linkSalaryEntry, payFromBankLine, paymentStatuses, recordSalaryPayment } = await import("../src/lib/payroll/service");

import { createTestUsers } from "./helpers/fixture-users";

const MARK = "PayrollTest";
let cleanupUsers: () => Promise<void>;
const ZERO = { overtime: 0, arrears: 0, incentives: 0, insurance: 0, bonus: 0, advanceGiven: 0, advanceRepaid: 0 };
let userId: string;
let empId: string;
let centerId: string;
let bankId: string;
let cashId: string;

async function sweep() {
  const accts = await db.select({ id: financeAccounts.id }).from(financeAccounts).where(like(financeAccounts.name, `${MARK}%`));
  const emps = await db.select({ id: employees.id }).from(employees).where(like(employees.name, `${MARK}%`));
  for (const e of emps) {
    await db.execute(sql`delete from payslip_payments where payslip_id in (select id from payslips where employee_id = ${e.id}::uuid)`);
    await db.execute(sql`delete from payslips where employee_id = ${e.id}::uuid`);
    await db.execute(sql`delete from pay_revisions where employee_id = ${e.id}::uuid`);
    await db.execute(sql`delete from leave_requests where employee_id = ${e.id}::uuid`);
    await db.execute(sql`delete from employee_pay where employee_id = ${e.id}::uuid`);
  }
  for (const a of accts) {
    await db.execute(sql`delete from bank_matches where bank_line_id in (select id from bank_statement_lines where account_id = ${a.id}::uuid)`);
    await db.delete(bankStatementLines).where(eq(bankStatementLines.accountId, a.id));
    await db.delete(financeTransactions).where(eq(financeTransactions.accountId, a.id));
  }
  await db.delete(employees).where(like(employees.name, `${MARK}%`));
  await db.delete(financeAccounts).where(like(financeAccounts.name, `${MARK}%`));
  await db.delete(centers).where(like(centers.name, `${MARK}%`));
}

beforeAll(async () => {
  await sweep();
  const users = await createTestUsers(["hr"]);
  cleanupUsers = users.cleanup;
  userId = users.ids[0];
  const [c] = await db.insert(centers).values({ name: `${MARK} centre`, city: "Kochi" }).returning({ id: centers.id });
  centerId = c.id;
  bankId = (await db.insert(financeAccounts).values({ name: `${MARK} bank`, centerId, type: "bank" }).returning({ id: financeAccounts.id }))[0].id;
  cashId = (await db.insert(financeAccounts).values({ name: `${MARK} cash`, centerId, type: "cash" }).returning({ id: financeAccounts.id }))[0].id;
  const [e] = await db
    .insert(employees)
    .values({ empNo: `${MARK}-1`, name: `${MARK} Asha`, dateOfJoining: "2020-01-01", designation: "Designer", userId: null })
    .returning({ id: employees.id });
  empId = e.id;
  await db.insert(employeePay).values({ employeeId: empId, basicPaise: 3_000_000, hraPaise: 1_500_000, otherPaise: 1_000_000, medicalPaise: 1_000_000 });
});
afterAll(async () => {
  await sweep();
  await cleanupUsers();
});

const gen = (month: string, over: Partial<Parameters<typeof generatePayslip>[1]> = {}) =>
  generatePayslip(db, { employeeId: empId, month, money: ZERO, entries: [], regenerate: false, userId, ...over });

describe("generating", () => {
  it("generates a month, carries the closing balances into the next, and refuses to repeat or go backwards", async () => {
    const oct = await gen("2026-10", { entries: [{ date: "2026-10-05", type: "sick" }] });
    expect(oct).toMatchObject({ ok: true, net: 6_500_000 });
    const nov = await gen("2026-11", { entries: [{ date: "2026-11-05", type: "sick" }] });
    expect(nov.ok && nov.result.leave.slClosing).toBe(4);

    expect(await gen("2026-11")).toMatchObject({ ok: false, error: expect.stringMatching(/Regenerate/) });
    expect(await gen("2026-10", { regenerate: true })).toMatchObject({ ok: false, error: expect.stringMatching(/in order/) });
    expect(await gen("2026-09")).toMatchObject({ ok: false, error: expect.stringMatching(/in order/) });
  });

  it("regenerates the latest month as a new version and keeps the old one", async () => {
    const again = await gen("2026-11", { regenerate: true, entries: [] });
    expect(again.ok && again.result.leave.slClosing).toBe(5);
    const rows = await db.select().from(payslips).where(and(eq(payslips.employeeId, empId), eq(payslips.month, "2026-11")));
    expect(rows.map((r) => [r.version, r.status]).sort()).toEqual([[1, "superseded"], [2, "current"]]);
  });

  it("refuses to regenerate an imported month", async () => {
    await db.execute(sql`update payslips set imported = true where employee_id = ${empId}::uuid and month = '2026-11' and status = 'current'`);
    expect(await gen("2026-11", { regenerate: true })).toMatchObject({ ok: false, error: expect.stringMatching(/imported/) });
    await db.execute(sql`update payslips set imported = false where employee_id = ${empId}::uuid`);
  });

  it("takes approved leave from the leave slips, whatever the person generating enters", async () => {
    await db.insert(leaveRequests).values({
      employeeId: empId, kind: "lop", fromDate: "2026-12-07", toDate: "2026-12-07", days: 1, status: "approved",
    });
    const dec = await gen("2026-12", { entries: [] });
    expect(dec.ok && dec.result.lines.lop).toBeGreaterThan(0);
    expect(dec.ok && dec.result.leave.treated.map((t) => t.date)).toEqual(["2026-12-07"]);
    // Trying to change what an approved day was is overruled.
    const tried = await gen("2026-12", { regenerate: true, entries: [{ date: "2026-12-07", type: "casual" }] });
    expect(tried.ok && tried.result.leave.treated[0].treatedAs).toBe("lop");
  });

  it("a promotion moves the master pay, and regenerating the month gives the same slip", async () => {
    const first = await gen("2027-01", { revision: { effectiveDate: "2027-01-11", newComponents: { basic: 3_600_000 } } });
    expect(first.ok && first.result.components.basic).toBe(Math.round((3_000_000 * 10 + 3_600_000 * 21) / 31));
    const [pay] = await db.select().from(employeePay).where(eq(employeePay.employeeId, empId));
    expect(pay.basicPaise).toBe(3_600_000);
    const again = await gen("2027-01", { regenerate: true });
    expect(again.ok && again.net).toBe(first.ok && first.net);
  });
});

describe("paying", () => {
  async function slipFor(month: string) {
    const [s] = await db.select().from(payslips).where(and(eq(payslips.employeeId, empId), eq(payslips.month, month), eq(payslips.status, "current")));
    return s;
  }

  it("will not take a payment until the owner approves", async () => {
    const slip = await slipFor("2026-10");
    const r = await recordSalaryPayment(db, { payslipId: slip.id, accountId: bankId, amountPaise: slip.netPaise, occurredOn: "2026-11-01", reference: null, userId });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/approve/) });
    expect(await approvePayslip(db, { payslipId: slip.id, userId })).toEqual({ ok: true });
    expect(await approvePayslip(db, { payslipId: slip.id, userId })).toMatchObject({ ok: false });
  });

  it("records a payment, refuses to overpay, and shows paid only once a statement line proves it", async () => {
    const slip = await slipFor("2026-10");
    const part = await recordSalaryPayment(db, { payslipId: slip.id, accountId: bankId, amountPaise: 2_000_000, occurredOn: "2026-11-01", reference: null, userId });
    expect(part.ok).toBe(true);
    expect(await recordSalaryPayment(db, { payslipId: slip.id, accountId: bankId, amountPaise: 9_999_999, occurredOn: "2026-11-01", reference: null, userId })).toMatchObject({ ok: false });

    let status = (await paymentStatuses(db, [{ id: slip.id, netPaise: slip.netPaise }])).get(slip.id)!;
    expect(status).toMatchObject({ state: "partial", recordedPaise: 2_000_000, verifiedPaise: 0, remainingPaise: 4_500_000 });

    const rest = await recordSalaryPayment(db, { payslipId: slip.id, accountId: bankId, amountPaise: 4_500_000, occurredOn: "2026-11-02", reference: null, userId });
    expect(rest.ok).toBe(true);
    status = (await paymentStatuses(db, [{ id: slip.id, netPaise: slip.netPaise }])).get(slip.id)!;
    expect(status.state).toBe("recorded"); // in the books, but no statement line proves it

    // The bank statement arrives; the automatic matching pairs the two payments with their lines.
    await saveStatementLines(db, {
      accountId: bankId, centerId, importedBy: null,
      lines: [
        { occurredOn: "2026-11-01", particulars: "NEFT ASHA", direction: "out", amountPaise: 2_000_000, balancePaise: null, note: null, dateGuessed: false, fingerprint: "p1".padEnd(64, "0") },
        { occurredOn: "2026-11-02", particulars: "NEFT ASHA", direction: "out", amountPaise: 4_500_000, balancePaise: null, note: null, dateGuessed: false, fingerprint: "p2".padEnd(64, "0") },
      ],
    });
    expect(await autoMatchAccount(db, bankId)).toBe(2);
    status = (await paymentStatuses(db, [{ id: slip.id, netPaise: slip.netPaise }])).get(slip.id)!;
    expect(status).toMatchObject({ state: "paid", verifiedPaise: 6_500_000, remainingPaise: 0 });
  });

  it("a payment that is reversed stops counting as paid", async () => {
    const slip = await slipFor("2026-10");
    const [link] = await db.execute<{ transaction_id: string }>(sql`select transaction_id from payslip_payments where payslip_id = ${slip.id}::uuid limit 1`);
    await db.transaction((tx) => reverseTransaction(tx, { transactionId: link.transaction_id, reason: "wrong account", recordedBy: userId }));
    const status = (await paymentStatuses(db, [{ id: slip.id, netPaise: slip.netPaise }])).get(slip.id)!;
    expect(status.state).toBe("partial");
    expect(status.remainingPaise).toBeGreaterThan(0);
  });

  it("maps a bank statement line to a payslip in one step", async () => {
    const slip = await slipFor("2026-11");
    await approvePayslip(db, { payslipId: slip.id, userId });
    await saveStatementLines(db, {
      accountId: bankId, centerId, importedBy: null,
      lines: [{ occurredOn: "2026-12-01", particulars: "NEFT ASHA NOV", direction: "out", amountPaise: slip.netPaise, balancePaise: null, note: null, dateGuessed: false, fingerprint: "p3".padEnd(64, "0") }],
    });
    const [line] = await db.select().from(bankStatementLines).where(eq(bankStatementLines.fingerprint, "p3".padEnd(64, "0")));
    expect(await payFromBankLine(db, { payslipId: slip.id, bankLineId: line.id, userId })).toEqual({ ok: true });
    const status = (await paymentStatuses(db, [{ id: slip.id, netPaise: slip.netPaise }])).get(slip.id)!;
    expect(status).toMatchObject({ state: "paid", verifiedPaise: slip.netPaise });
    // The same line cannot pay twice.
    expect(await payFromBankLine(db, { payslipId: slip.id, bankLineId: line.id, userId })).toMatchObject({ ok: false });
  });

  it("links a Salaries entry that already exists, only if it is a Salaries expense that fits", async () => {
    const slip = await slipFor("2026-12");
    await approvePayslip(db, { payslipId: slip.id, userId });
    const { postEntry } = await import("../src/lib/finance/post");
    const good = await postEntry(db, { occurredOn: "2026-12-30", direction: "out", kind: "expense", accountId: cashId, category: "Salaries", amountPaise: slip.netPaise, description: "cash" });
    const wrongCategory = await postEntry(db, { occurredOn: "2026-12-30", direction: "out", kind: "expense", accountId: cashId, category: "Rent", amountPaise: 100, description: "rent" });
    expect(await linkSalaryEntry(db, { payslipId: slip.id, transactionId: wrongCategory.id, userId })).toMatchObject({ ok: false });
    expect(await linkSalaryEntry(db, { payslipId: slip.id, transactionId: good.id, userId })).toEqual({ ok: true });
    expect(await linkSalaryEntry(db, { payslipId: slip.id, transactionId: good.id, userId })).toMatchObject({ ok: false });
    const status = (await paymentStatuses(db, [{ id: slip.id, netPaise: slip.netPaise }])).get(slip.id)!;
    // Cash can't be proved by a statement; it is shown as paid in cash.
    expect(status).toMatchObject({ state: "paid", cashPaise: slip.netPaise, verifiedPaise: 0 });
  });
});
