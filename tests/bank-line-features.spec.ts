/**
 * Refunds, moves between accounts (including a director account), a credit
 * split across students through a payment gateway, and comments. Real database.
 */
import { config as loadEnv } from "dotenv";
import { and, eq, like, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const { db } = await import("../src/lib/db/client");
const s = await import("../src/lib/db/schema");
const { saveStatementLines } = await import("../src/lib/finance/bank-ledger");
const { answerKey, categoriseWithLinks, commentFor } = await import("../src/lib/finance/categorise-links");
const { ruleFromMetadata } = await import("../src/lib/finance/category-links");
const { moveLinesToAccount } = await import("../src/lib/finance/move-money");
const { splitCreditLine, splitShortfall } = await import("../src/lib/finance/split-line");
const { addComment, cleanComment, editComment } = await import("../src/lib/finance/comments");
const { recordPayment } = await import("../src/lib/enrolment/record-payment");
const { createTestUsers } = await import("./helpers/fixture-users");

const MARK = "BankFeatTest";
let userId: string;
let cleanupUsers: (() => Promise<void>) | undefined;
let centerId: string;
let bank: string;
let bank2: string;
let director: string;
let gateway: string;
const enrol: string[] = [];

const actor = (permissions: Record<string, "all">) => ({
  id: userId, email: "t@example.com", fullName: "T", avatarUrl: null, roleId: "r", roleCode: "accounts", roleName: "Accounts",
  centerIds: [centerId], permissions,
});
const fp = (n: number) => `feat-${n}-`.padEnd(64, "0");
const lineOf = (n: number, over: Record<string, unknown> = {}) => ({
  occurredOn: "2026-11-05", particulars: `UPI-${n}-X`, direction: "in" as const, amountPaise: 1_000_000, balancePaise: null,
  note: null, dateGuessed: false, fingerprint: fp(n), ...over,
});
async function line(n: number, accountId = bank, over: Record<string, unknown> = {}) {
  await saveStatementLines(db, { accountId, centerId, importedBy: null, lines: [lineOf(n, over)] });
  const [row] = await db.select().from(s.bankStatementLines).where(eq(s.bankStatementLines.fingerprint, fp(n)));
  return row;
}
const balance = async (accountId: string) =>
  Number(
    (
      await db.execute<{ b: string }>(sql`select coalesce(sum(case when direction in ('in','transfer_in') then amount_paise else -amount_paise end),0) as b from finance_transactions where account_id = ${accountId}::uuid`)
    )[0].b,
  );

async function sweep() {
  const accts = await db.select({ id: s.financeAccounts.id }).from(s.financeAccounts).where(like(s.financeAccounts.name, `${MARK}%`));
  for (const a of accts) {
    const txns = await db.select({ id: s.financeTransactions.id }).from(s.financeTransactions).where(eq(s.financeTransactions.accountId, a.id));
    for (const t of txns) await db.delete(s.financeTransactionComments).where(eq(s.financeTransactionComments.transactionId, t.id));
    await db.delete(s.bankMatches).where(eq(s.bankMatches.centerId, centerId ?? a.id));
    await db.delete(s.bankStatementLines).where(eq(s.bankStatementLines.accountId, a.id));
    await db.delete(s.financeTransactions).where(eq(s.financeTransactions.accountId, a.id));
  }
  const ls = await db.select({ id: s.leads.id }).from(s.leads).where(like(s.leads.studentName, `${MARK}%`));
  for (const l of ls) {
    const es = await db.select({ id: s.enrolments.id }).from(s.enrolments).where(eq(s.enrolments.leadId, l.id));
    for (const e of es) {
      const ps = await db.select({ id: s.payments.id }).from(s.payments).where(eq(s.payments.enrolmentId, e.id));
      for (const p of ps) await db.delete(s.receipts).where(eq(s.receipts.paymentId, p.id));
      await db.delete(s.payments).where(eq(s.payments.enrolmentId, e.id));
    }
    await db.delete(s.enrolments).where(eq(s.enrolments.leadId, l.id));
  }
  await db.delete(s.students).where(like(s.students.fullName, `${MARK}%`));
  await db.delete(s.leads).where(like(s.leads.studentName, `${MARK}%`));
  await db.delete(s.financeAccounts).where(like(s.financeAccounts.name, `${MARK}%`));
  await db.delete(s.centers).where(like(s.centers.name, `${MARK}%`));
}

beforeAll(async () => {
  await sweep();
  const users = await createTestUsers(["accounts"]);
  cleanupUsers = users.cleanup;
  userId = users.ids[0];
  centerId = (await db.insert(s.centers).values({ name: `${MARK} centre`, city: "Kochi" }).returning({ id: s.centers.id }))[0].id;
  const acct = async (n: string, type: "bank" | "director" | "gateway") =>
    (await db.insert(s.financeAccounts).values({ name: `${MARK} ${n}`, centerId, type }).returning({ id: s.financeAccounts.id }))[0].id;
  bank = await acct("Federal", "bank");
  bank2 = await acct("HDFC", "bank");
  director = await acct("Director", "director");
  gateway = await acct("Gateway", "gateway");
  for (const n of ["A", "B", "C"]) {
    const [lead] = await db
      .insert(s.leads)
      .values({ studentName: `${MARK} ${n}`, primaryPhone: `+91984730${n.charCodeAt(0)}00`, centerId, interestedExams: ["NID"], examYear: "2027" })
      .returning({ id: s.leads.id });
    const [e] = await db
      .insert(s.enrolments)
      .values({ leadId: lead.id, course: "Foundation", centerId, mode: "offline", academicYear: "2026-27", totalFeePaise: 30_000_000, netFeePaise: 30_000_000, salesToAccountsAt: new Date() })
      .returning({ id: s.enrolments.id });
    enrol.push(e.id);
  }
});
afterAll(async () => {
  await sweep();
  await cleanupUsers?.();
});

const accounts = () => actor({ "finance.record": "all", "payment.record": "all", "payment.refund": "all" });

describe("a refund to a student", () => {
  it("shows on the student's profile as money returned, and leaves the bank in the books", async () => {
    await db.transaction((tx) => recordPayment(tx, { enrolmentId: enrol[0], amountPaise: 5_000_000, method: "upi", recordedBy: null, accountId: bank }));
    const l = await line(1, bank, { direction: "out", amountPaise: 2_000_000, particulars: "NEFT REFUND ASHA" });
    const r = await categoriseWithLinks({
      lines: [l], direction: "out", choice: "Student Refund", rule: ruleFromMetadata("Student Refund", { links: "refund" }), actor: accounts(),
      answers: { [answerKey("enrolment", l.id)]: enrol[0] },
    });
    expect(r).toEqual({ ok: true, done: 1 });
    const rows = await db.select().from(s.payments).where(eq(s.payments.enrolmentId, enrol[0]));
    const net = rows.reduce((sum, p) => sum + (p.direction === "credit" ? p.amountPaise : -p.amountPaise), 0);
    expect(net).toBe(3_000_000);
    expect(rows.find((p) => p.direction === "debit")).toMatchObject({ amountPaise: 2_000_000, method: "neft" });
    const [after] = await db.select().from(s.bankStatementLines).where(eq(s.bankStatementLines.id, l.id));
    expect(after.status).toBe("posted");
  });

  it("needs the refund permission", async () => {
    const l = await line(2, bank, { direction: "out", amountPaise: 1_000 });
    const r = await categoriseWithLinks({
      lines: [l], direction: "out", choice: "Student Refund", rule: ruleFromMetadata("Student Refund", { links: "refund" }),
      actor: actor({ "finance.record": "all", "payment.record": "all" } as never), answers: { [answerKey("enrolment", l.id)]: enrol[0] },
    });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/refund permission/) });
  });
});

describe("moving money between our own accounts", () => {
  it("records a director's contribution in the books without touching income or expense", async () => {
    const l = await line(3, bank, { amountPaise: 5_500_000, particulars: "NEFT FROM DIRECTOR" });
    await db.transaction((tx) => moveLinesToAccount(tx, { lines: [l], otherAccountId: director, userId }));
    expect(await balance(director)).toBe(-5_500_000); // the institute owes the director
    const [leg] = await db.select().from(s.financeTransactions).where(and(eq(s.financeTransactions.accountId, bank), eq(s.financeTransactions.amountPaise, 5_500_000)));
    expect(leg).toMatchObject({ direction: "transfer_in", kind: "transfer" });
    const [m] = await db.select().from(s.bankMatches).where(eq(s.bankMatches.bankLineId, l.id));
    expect(m).toMatchObject({ transactionId: leg.id, method: "categorised", active: true });
  });

  it("records drawings as the reverse", async () => {
    const l = await line(4, bank, { direction: "out", amountPaise: 1_200_000, particulars: "NEFT TO DIRECTOR" });
    await db.transaction((tx) => moveLinesToAccount(tx, { lines: [l], otherAccountId: director, userId }));
    expect(await balance(director)).toBe(-5_500_000 + 1_200_000);
  });

  it("pairs the other account's statement with the move already recorded, instead of doubling it", async () => {
    const out = await line(5, bank, { direction: "out", amountPaise: 700_000, particulars: "NEFT TO HDFC", occurredOn: "2026-11-06" });
    await db.transaction((tx) => moveLinesToAccount(tx, { lines: [out], otherAccountId: bank2, userId }));
    const before = (await db.select().from(s.financeTransactions).where(eq(s.financeTransactions.accountId, bank2))).length;
    expect(before).toBe(1);

    const arrival = await line(6, bank2, { direction: "in", amountPaise: 700_000, particulars: "NEFT FROM FEDERAL", occurredOn: "2026-11-07" });
    await db.transaction((tx) => moveLinesToAccount(tx, { lines: [arrival], otherAccountId: bank, userId }));
    // No second pair: HDFC still has the one leg, now paired with its own statement line.
    expect((await db.select().from(s.financeTransactions).where(eq(s.financeTransactions.accountId, bank2))).length).toBe(1);
    const [m] = await db.select().from(s.bankMatches).where(eq(s.bankMatches.bankLineId, arrival.id));
    expect(m.transactionId).not.toBeNull();
    expect(await balance(bank2)).toBe(700_000);
  });

  it("will not move money to the account it is already in", async () => {
    const l = await line(7, bank);
    await expect(db.transaction((tx) => moveLinesToAccount(tx, { lines: [l], otherAccountId: bank, userId }))).rejects.toThrow(/different account/);
  });
});

describe("one credit that is several students' payments, through a gateway", () => {
  // Students paid ₹1,00,000 + ₹40,000 + ₹60,000; the gateway kept ₹4,720; the bank got ₹1,95,280.
  const allocations = () => [
    { enrolmentId: enrol[0], amountPaise: 10_000_000 },
    { enrolmentId: enrol[1], amountPaise: 4_000_000 },
    { enrolmentId: enrol[2], amountPaise: 6_000_000 },
  ];

  it("works out what is left unaccounted for", () => {
    expect(splitShortfall(allocations(), 472_000, 19_528_000)).toBe(0);
    expect(splitShortfall(allocations(), 0, 19_528_000)).toBe(472_000);
  });

  it("credits each student their own amount and leaves the gateway account at zero", async () => {
    const l = await line(8, bank, { amountPaise: 19_528_000, particulars: "RAZORPAY SETTLEMENT" });
    const out = await db.transaction((tx) =>
      splitCreditLine(tx, { line: l, allocations: allocations(), gatewayFeePaise: 472_000, gatewayAccountId: gateway, feeCategory: "Course Fees", chargeCategory: "Payment Gateway Charges", userId }),
    );
    expect(out.paymentIds).toHaveLength(3);
    for (const [i, amount] of [10_000_000, 4_000_000, 6_000_000].entries()) {
      const rows = await db.select().from(s.payments).where(and(eq(s.payments.enrolmentId, enrol[i]), eq(s.payments.amountPaise, amount)));
      expect(rows.length).toBeGreaterThanOrEqual(1);
    }
    expect(await balance(gateway)).toBe(0);
    const [m] = await db.select().from(s.bankMatches).where(eq(s.bankMatches.bankLineId, l.id));
    expect(m.transactionId).toBe(out.bankLegId);
    const [leg] = await db.select().from(s.financeTransactions).where(eq(s.financeTransactions.id, out.bankLegId));
    expect(leg).toMatchObject({ accountId: bank, direction: "transfer_in", amountPaise: 19_528_000 });
    const fee = await db.select().from(s.financeTransactions).where(and(eq(s.financeTransactions.accountId, gateway), eq(s.financeTransactions.kind, "expense")));
    expect(fee[0]).toMatchObject({ amountPaise: 472_000, category: "Payment Gateway Charges" });
  });

  it("refuses amounts that do not add up, and records nothing", async () => {
    const l = await line(9, bank, { amountPaise: 19_528_000, particulars: "RAZORPAY SETTLEMENT 2" });
    const before = (await db.select().from(s.payments)).length;
    await expect(
      db.transaction((tx) =>
        splitCreditLine(tx, { line: l, allocations: allocations(), gatewayFeePaise: 400_000, gatewayAccountId: gateway, feeCategory: "Course Fees", chargeCategory: "Payment Gateway Charges", userId }),
      ),
    ).rejects.toThrow(/more than the bank received/);
    expect((await db.select().from(s.payments)).length).toBe(before);
    const [after] = await db.select().from(s.bankStatementLines).where(eq(s.bankStatementLines.id, l.id));
    expect(after.status).toBe("pending");
  });

  it("needs a real gateway account", async () => {
    const l = await line(10, bank, { amountPaise: 19_528_000, particulars: "RAZORPAY SETTLEMENT 3" });
    await expect(
      db.transaction((tx) =>
        splitCreditLine(tx, { line: l, allocations: allocations(), gatewayFeePaise: 472_000, gatewayAccountId: bank2, feeCategory: "Course Fees", chargeCategory: "x", userId }),
      ),
    ).rejects.toThrow(/gateway account/);
  });

  it("goes through the categorise flow from the form's answers", async () => {
    const l = await line(11, bank, { amountPaise: 4_900_000, particulars: "PAYU SETTLEMENT" });
    const r = await categoriseWithLinks({
      lines: [l], direction: "in", choice: "Course Fees", rule: ruleFromMetadata("Course Fees", { links: "enrolment" }), actor: accounts(),
      answers: {
        [answerKey("split", l.id)]: JSON.stringify([{ enrolmentId: enrol[0], amountPaise: 3_000_000 }, { enrolmentId: enrol[1], amountPaise: 2_000_000 }]),
        [answerKey("gateway", l.id)]: gateway,
        [answerKey("gatewayFee", l.id)]: "1,000",
      },
    });
    expect(r).toEqual({ ok: true, done: 1 });
    expect(await balance(gateway)).toBe(0);
  });
});

describe("comments on a transaction", () => {
  it("are added, can be edited later, and keep who wrote them", async () => {
    const l = await line(12, bank, { direction: "out", amountPaise: 50_000, particulars: "AIRTEL BILL" });
    await db.transaction((tx) => moveLinesToAccount(tx, { lines: [l], otherAccountId: bank2, userId }));
    const [leg] = await db.select().from(s.financeTransactions).where(and(eq(s.financeTransactions.accountId, bank), eq(s.financeTransactions.amountPaise, 50_000)));
    const id = await addComment(db, { transactionId: leg.id, body: "  Simi's   second mobile, October ", userId });
    let [row] = await db.select().from(s.financeTransactionComments).where(eq(s.financeTransactionComments.id, id));
    expect(row).toMatchObject({ body: "Simi's second mobile, October", createdBy: userId, editedAt: null });
    const edited = await editComment(db, { commentId: id, body: "Simi's second mobile, October bill", userId });
    expect(edited.before).toBe("Simi's second mobile, October");
    [row] = await db.select().from(s.financeTransactionComments).where(eq(s.financeTransactionComments.id, id));
    expect(row.body).toBe("Simi's second mobile, October bill");
    expect(row.editedAt).not.toBeNull();
  });

  it("cannot be empty, and are trimmed and capped", async () => {
    expect(cleanComment("   ")).toBeNull();
    expect(cleanComment("x".repeat(2000))).toHaveLength(1000);
    await expect(editComment(db, { commentId: "00000000-0000-0000-0000-000000000000", body: "x", userId })).rejects.toThrow(/no longer exists/);
    expect(commentFor({ [answerKey("comment", "L")]: " hello  there " }, "L")).toBe("hello there");
  });
});
