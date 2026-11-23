/**
 * Filing a bank line under a category that asks whose it is: a student's fee
 * lands on their profile, a fine is tagged to a student, a rent line carries
 * its month — and a batch is all or nothing. Needs a real database.
 */
import { config as loadEnv } from "dotenv";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const { db } = await import("../src/lib/db/client");
const { bankMatches, bankStatementLines, centers, enrolments, financeAccounts, financeTransactions, leads, payments, receipts, students } =
  await import("../src/lib/db/schema");
const { saveStatementLines } = await import("../src/lib/finance/bank-ledger");
const { answerKey, categoriseWithLinks } = await import("../src/lib/finance/categorise-links");
const { isPeriod, methodFromNarration, monthOf, ruleFromMetadata } = await import("../src/lib/finance/category-links");

const { createTestUsers } = await import("./helpers/fixture-users");

const MARKER = "BankLinkTest";
let actorId: string;
let cleanupUsers: (() => Promise<void>) | undefined;
let centerId: string;
let otherCenterId: string;
let accountId: string;
let enrolmentId: string;
let studentId: string;

const actor = (permissions: Record<string, "own" | "center" | "all">, centerIds: string[]) => ({
  id: actorId,
  email: "t@example.com",
  fullName: "Test",
  avatarUrl: null,
  roleId: "r",
  roleCode: "accounts",
  roleName: "Accounts",
  centerIds,
  permissions,
});

const fp = (n: number) => `link-${n}-`.padEnd(64, "0");
const lineOf = (n: number, over: Partial<{ occurredOn: string; direction: "in" | "out"; amountPaise: number; particulars: string }> = {}) => ({
  occurredOn: "2026-10-03",
  particulars: `UPI-${n}-STUDENT`,
  direction: "in" as const,
  amountPaise: 1_500_000,
  balancePaise: null,
  note: null,
  dateGuessed: false,
  fingerprint: fp(n),
  ...over,
});

async function sweep() {
  const accts = await db.select({ id: financeAccounts.id }).from(financeAccounts).where(like(financeAccounts.name, `${MARKER}%`));
  for (const a of accts) {
    await db.delete(bankMatches).where(eq(bankMatches.centerId, centerId ?? a.id));
    await db.delete(bankStatementLines).where(eq(bankStatementLines.accountId, a.id));
    await db.delete(financeTransactions).where(eq(financeTransactions.accountId, a.id));
  }
  const testLeads = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARKER}%`));
  for (const lead of testLeads) {
    const es = await db.select({ id: enrolments.id }).from(enrolments).where(eq(enrolments.leadId, lead.id));
    for (const e of es) {
      const ps = await db.select({ id: payments.id }).from(payments).where(eq(payments.enrolmentId, e.id));
      for (const p of ps) await db.delete(receipts).where(eq(receipts.paymentId, p.id));
      await db.delete(payments).where(eq(payments.enrolmentId, e.id));
    }
    await db.delete(enrolments).where(eq(enrolments.leadId, lead.id));
  }
  await db.delete(students).where(like(students.fullName, `${MARKER}%`));
  await db.delete(leads).where(like(leads.studentName, `${MARKER}%`));
  await db.delete(financeAccounts).where(like(financeAccounts.name, `${MARKER}%`));
  await db.delete(centers).where(like(centers.name, `${MARKER}%`));
}

beforeAll(async () => {
  await sweep();
  const users = await createTestUsers(["accounts"]);
  cleanupUsers = users.cleanup;
  actorId = users.ids[0];
  const [c] = await db.insert(centers).values({ name: `${MARKER} centre`, city: "Kochi" }).returning({ id: centers.id });
  const [o] = await db.insert(centers).values({ name: `${MARKER} other centre`, city: "Kannur" }).returning({ id: centers.id });
  centerId = c.id;
  otherCenterId = o.id;
  const [a] = await db.insert(financeAccounts).values({ name: `${MARKER} bank`, centerId, type: "bank" }).returning({ id: financeAccounts.id });
  accountId = a.id;
  const [lead] = await db
    .insert(leads)
    .values({ studentName: `${MARKER} Asha`, primaryPhone: "+919847300777", centerId, interestedExams: ["NID"], examYear: "2027" })
    .returning({ id: leads.id });
  const [e] = await db
    .insert(enrolments)
    .values({ leadId: lead.id, course: "Foundation", centerId, mode: "offline", academicYear: "2026-27", totalFeePaise: 10_000_000, netFeePaise: 10_000_000, salesToAccountsAt: new Date() })
    .returning({ id: enrolments.id });
  enrolmentId = e.id;
});
afterAll(async () => {
  await sweep();
  await cleanupUsers?.();
});

async function pending(n: number, over = {}) {
  await saveStatementLines(db, { accountId, centerId, importedBy: null, lines: [lineOf(n, over)] });
  const [row] = await db.select().from(bankStatementLines).where(eq(bankStatementLines.fingerprint, fp(n)));
  return row;
}

const feeRule = ruleFromMetadata("Course Fees", { links: "enrolment" });


const accountsActor = () => actor({ "finance.record": "all", "payment.record": "all" }, [centerId]);

describe("a student's fee filed from a bank line", () => {
  it("is recorded on the student's profile, with a receipt, dated by the bank", async () => {
    const line = await pending(1);
    const result = await categoriseWithLinks({
      lines: [line], direction: "in", choice: "Course Fees", rule: feeRule,
      actor: accountsActor(),
      answers: { [answerKey("enrolment", line.id)]: enrolmentId },
    });
    expect(result).toEqual({ ok: true, done: 1 });

    const paid = await db.select().from(payments).where(eq(payments.enrolmentId, enrolmentId));
    expect(paid).toHaveLength(1);
    expect(paid[0]).toMatchObject({ amountPaise: 1_500_000, direction: "credit", method: "upi" });
    expect(paid[0].receivedAt.toISOString().slice(0, 10)).toBe("2026-10-03");
    expect(await db.select().from(receipts).where(eq(receipts.paymentId, paid[0].id))).toHaveLength(1);

    // The first payment opened the student's record (the accounts-to-academics gate).
    const [enrolment] = await db.select().from(enrolments).where(eq(enrolments.id, enrolmentId));
    expect(enrolment.studentId).not.toBeNull();
    studentId = enrolment.studentId!;

    // One ledger entry, tied to the payment, and the line is paired with it.
    const ledger = await db.select().from(financeTransactions).where(eq(financeTransactions.accountId, accountId));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ kind: "fee", category: "Course Fees", paymentId: paid[0].id, amountPaise: 1_500_000 });
    const [after] = await db.select().from(bankStatementLines).where(eq(bankStatementLines.id, line.id));
    expect(after).toMatchObject({ status: "posted", transactionId: ledger[0].id });
  });

  it("will not file a fee without saying whose it is", async () => {
    const line = await pending(2);
    const result = await categoriseWithLinks({ lines: [line], direction: "in", choice: "Course Fees", rule: feeRule, actor: accountsActor(), answers: {} });
    expect(result).toMatchObject({ ok: false });
    const [after] = await db.select().from(bankStatementLines).where(eq(bankStatementLines.id, line.id));
    expect(after.status).toBe("pending");
  });

  it("refuses a student outside the caller's centres", async () => {
    const line = await pending(3);
    const result = await categoriseWithLinks({
      lines: [line], direction: "in", choice: "Course Fees", rule: feeRule,
      actor: actor({ "finance.record": "center", "payment.record": "center" }, [otherCenterId]),
      answers: { [answerKey("enrolment", line.id)]: enrolmentId },
    });
    expect(result).toMatchObject({ ok: false });
    expect((await db.select().from(payments).where(eq(payments.enrolmentId, enrolmentId))).length).toBe(1);
  });

  it("is all or nothing: one bad line leaves the others unrecorded", async () => {
    const good = await pending(4);
    const bad = await pending(5);
    const result = await categoriseWithLinks({
      lines: [good, bad], direction: "in", choice: "Course Fees", rule: feeRule, actor: accountsActor(),
      answers: {
        [answerKey("enrolment", good.id)]: enrolmentId,
        [answerKey("enrolment", bad.id)]: "00000000-0000-0000-0000-00000000dead",
      },
    });
    expect(result).toMatchObject({ ok: false });
    expect((await db.select().from(payments).where(eq(payments.enrolmentId, enrolmentId))).length).toBe(1);
    const [stillPending] = await db.select().from(bankStatementLines).where(eq(bankStatementLines.id, good.id));
    expect(stillPending.status).toBe("pending");
  });
});

describe("a fine tagged to a student", () => {
  it("names the student on the ledger entry without making a fee payment", async () => {
    const line = await pending(6, { amountPaise: 50_000 });
    const result = await categoriseWithLinks({
      lines: [line], direction: "in", choice: "Late Fee / Penalty Collected",
      rule: ruleFromMetadata("Late Fee / Penalty Collected", { links: "student" }), actor: accountsActor(),
      answers: { [answerKey("student", line.id)]: studentId },
    });
    expect(result).toEqual({ ok: true, done: 1 });
    const [entry] = await db.select().from(financeTransactions).where(eq(financeTransactions.accountId, accountId)).then((r) => r.filter((t) => t.amountPaise === 50_000));
    expect(entry).toMatchObject({ kind: "other_income", studentId, category: "Late Fee / Penalty Collected" });
    expect(entry.studentName).toContain(MARKER);
    expect((await db.select().from(payments).where(eq(payments.enrolmentId, enrolmentId))).length).toBe(1);
  });
});

describe("the month a payment is for", () => {
  const rentRule = ruleFromMetadata("Rent", { asksPeriod: true });
  it("is stored beside the day the cash moved", async () => {
    const line = await pending(7, { direction: "out", amountPaise: 400_000, occurredOn: "2026-11-03", particulars: "NEFT RENT" });
    const result = await categoriseWithLinks({
      lines: [line], direction: "out", choice: "Rent", rule: rentRule, actor: accountsActor(),
      answers: { [answerKey("period", line.id)]: "2026-10" },
    });
    expect(result).toEqual({ ok: true, done: 1 });
    const entry = (await db.select().from(financeTransactions).where(eq(financeTransactions.accountId, accountId))).find((t) => t.amountPaise === 400_000)!;
    expect(entry).toMatchObject({ period: "2026-10", direction: "out", category: "Rent" });
    expect(entry.occurredOn).toBe("2026-11-03");
  });

  it("may be left blank, and must be a real month when given", async () => {
    const blank = await pending(8, { direction: "out", amountPaise: 1_000 });
    expect(await categoriseWithLinks({ lines: [blank], direction: "out", choice: "Rent", rule: rentRule, actor: accountsActor(), answers: {} })).toEqual({ ok: true, done: 1 });
    const silly = await pending(9, { direction: "out", amountPaise: 2_000 });
    expect(await categoriseWithLinks({ lines: [silly], direction: "out", choice: "Rent", rule: rentRule, actor: accountsActor(), answers: { [answerKey("period", silly.id)]: "2026-13" } })).toMatchObject({ ok: false });
  });
});

describe("a salary filed from a bank line", () => {
  const salaryRule = ruleFromMetadata("Salaries", { links: "employee" });
  it("needs the payroll permission, and says whose salary it is", async () => {
    const line = await pending(10, { direction: "out", amountPaise: 3_000_000, particulars: "NEFT ASHA SALARY" });
    const withoutPayroll = await categoriseWithLinks({
      lines: [line], direction: "out", choice: "Salaries", rule: salaryRule, actor: accountsActor(),
      answers: { [answerKey("payslip", line.id)]: "00000000-0000-0000-0000-000000000abc" },
    });
    expect(withoutPayroll).toMatchObject({ ok: false, error: expect.stringMatching(/payroll permission/) });

    const payroll = actor({ "finance.record": "all", "payroll.generate": "all" }, [centerId]);
    const noPerson = await categoriseWithLinks({ lines: [line], direction: "out", choice: "Salaries", rule: salaryRule, actor: payroll, answers: {} });
    expect(noPerson).toMatchObject({ ok: false, error: expect.stringMatching(/whose salary/) });

    const unknownSlip = await categoriseWithLinks({
      lines: [line], direction: "out", choice: "Salaries", rule: salaryRule, actor: payroll,
      answers: { [answerKey("payslip", line.id)]: "00000000-0000-0000-0000-000000000abc" },
    });
    expect(unknownSlip).toMatchObject({ ok: false });
    // Nothing was recorded for the line.
    const [after] = await db.select().from(bankStatementLines).where(eq(bankStatementLines.id, line.id));
    expect(after.status).toBe("pending");
  });
});

describe("category settings", () => {
  it("reads what a category asks for from its own row", () => {
    expect(ruleFromMetadata("Salaries", { links: "employee" })).toEqual({ label: "Salaries", link: "employee", asksPeriod: false });
    expect(ruleFromMetadata("Rent", { asksPeriod: true })).toEqual({ label: "Rent", link: null, asksPeriod: true });
    expect(ruleFromMetadata("Other", null)).toEqual({ label: "Other", link: null, asksPeriod: false });
    expect(ruleFromMetadata("X", { links: "nonsense" }).link).toBeNull();
  });
  it("guesses how a payment arrived from the narration", () => {
    expect(methodFromNarration("UPI-1234-NAME@OKSBI")).toBe("upi");
    expect(methodFromNarration("NEFT/IFI/ABC")).toBe("neft");
    expect(methodFromNarration("FTIMPS/IFI/602100570095/GOOGLE")).toBe("neft");
    expect(methodFromNarration("CHQ DEP 000123")).toBe("cheque");
    expect(methodFromNarration("some transfer")).toBe("other");
  });
  it("knows a month from a date, and a real month from a typo", () => {
    expect(monthOf("2026-11-03")).toBe("2026-11");
    expect(isPeriod("2026-10")).toBe(true);
    expect(isPeriod("2026-13")).toBe(false);
    expect(isPeriod("Oct 2026")).toBe(false);
  });
});
