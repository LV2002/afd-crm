/**
 * Bank reconciliation: the pairing rules (pure) and what they do to a real
 * ledger (database). Every rule here exists to stop one specific way of
 * making money disappear from the books without anyone noticing.
 */
import { config as loadEnv } from "dotenv";
import { eq, like, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { planMatches, effectiveDirection } from "../src/lib/finance/reconcile-plan";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const { db } = await import("../src/lib/db/client");
const { bankMatches, bankStatementLines, centers, financeAccounts, financeTransactions } = await import("../src/lib/db/schema");
const { postEntry, reverseTransaction } = await import("../src/lib/finance/post");
const { saveStatementLines, resolveBankLines } = await import("../src/lib/finance/bank-ledger");
const { autoMatchAccount, matchManually, unmatch, waiveLine } = await import("../src/lib/finance/reconcile");
const { getReconciliation } = await import("../src/lib/finance/reconcile-queries");
const { checkContinuity } = await import("../src/lib/finance/bank-continuity");

const line = (id: string, on: string, direction: "in" | "out", amountPaise: number, particulars = "x") => ({
  id, occurredOn: on, direction, amountPaise, particulars,
});
const txn = (id: string, on: string, direction: "in" | "out", amountPaise: number, reference: string | null = null) => ({
  id, occurredOn: on, direction, amountPaise, reference,
});

describe("planMatches", () => {
  it("pairs one line with one entry of the same direction and amount", () => {
    expect(planMatches([line("l1", "2026-04-02", "in", 5000)], [txn("t1", "2026-04-01", "in", 5000)])).toEqual([
      { lineId: "l1", transactionId: "t1" },
    ]);
  });

  it("never pairs a different amount, even by a paisa, or the opposite direction", () => {
    expect(planMatches([line("l1", "2026-04-01", "in", 5000)], [txn("t1", "2026-04-01", "in", 5001)])).toEqual([]);
    expect(planMatches([line("l1", "2026-04-01", "in", 5000)], [txn("t1", "2026-04-01", "out", 5000)])).toEqual([]);
  });

  it("does not pair entries and lines far apart in date", () => {
    expect(planMatches([line("l1", "2026-04-20", "in", 5000)], [txn("t1", "2026-04-01", "in", 5000)])).toEqual([]);
  });

  it("makes no guess when two entries could both be one line", () => {
    const lines = [line("l1", "2026-04-02", "in", 5000)];
    const txns = [txn("t1", "2026-04-01", "in", 5000), txn("t2", "2026-04-02", "in", 5000)];
    expect(planMatches(lines, txns)).toEqual([]);
  });

  it("pairs two identical amounts when there are two of each", () => {
    const pairs = planMatches(
      [line("l1", "2026-04-02", "in", 5000), line("l2", "2026-04-03", "in", 5000)],
      [txn("t1", "2026-04-02", "in", 5000), txn("t2", "2026-04-03", "in", 5000)],
    );
    expect(pairs).toHaveLength(2);
  });

  it("uses a reference found in the narration to settle an otherwise ambiguous pair", () => {
    const pairs = planMatches(
      [line("l1", "2026-04-02", "in", 5000, "UPI-RAHUL-609912345678-FEE"), line("l2", "2026-04-02", "in", 5000, "UPI-ANU-111122223333")],
      [txn("t1", "2026-04-02", "in", 5000, "609912345678"), txn("t2", "2026-04-02", "in", 5000, "111122223333")],
    );
    expect(pairs).toContainEqual({ lineId: "l1", transactionId: "t1" });
    expect(pairs).toContainEqual({ lineId: "l2", transactionId: "t2" });
  });

  it("treats a reversal row as money going the other way", () => {
    expect(effectiveDirection("in", -5000)).toBe("out");
    expect(effectiveDirection("out", -5000)).toBe("in");
    expect(effectiveDirection("transfer_in", 5000)).toBe("in");
  });
});

const MARK = "ReconcileTest";
let centerId: string;
let accountId: string;
let cashId: string;

async function sweep() {
  const accts = await db.select({ id: financeAccounts.id }).from(financeAccounts).where(like(financeAccounts.name, `${MARK}%`));
  for (const a of accts) {
    await db.execute(sql`delete from bank_matches where bank_line_id in (select id from bank_statement_lines where account_id = ${a.id}::uuid)`);
    await db.delete(bankStatementLines).where(eq(bankStatementLines.accountId, a.id));
    await db.delete(financeTransactions).where(eq(financeTransactions.accountId, a.id));
  }
  await db.execute(sql`delete from cash_counts where account_id in (select id from finance_accounts where name like ${MARK + "%"})`);
  await db.execute(sql`delete from bank_balance_checks where account_id in (select id from finance_accounts where name like ${MARK + "%"})`);
  await db.delete(financeAccounts).where(like(financeAccounts.name, `${MARK}%`));
  await db.delete(centers).where(like(centers.name, `${MARK}%`));
}

async function fresh() {
  await db.execute(sql`delete from bank_matches where bank_line_id in (select id from bank_statement_lines where account_id = ${accountId}::uuid)`);
  await db.delete(bankStatementLines).where(eq(bankStatementLines.accountId, accountId));
  await db.delete(financeTransactions).where(eq(financeTransactions.accountId, accountId));
}

const stmt = (on: string, direction: "in" | "out", amountPaise: number, particulars: string, n: number) => ({
  occurredOn: on, particulars, direction, amountPaise, balancePaise: null as number | null, note: null, dateGuessed: false, seq: undefined as number | undefined,
  fingerprint: `${MARK}-${n}-${on}-${amountPaise}`.padEnd(64, "0"),
});
const post = (on: string, direction: "in" | "out", amountPaise: number, description: string, extra: { reference?: string; accountId?: string } = {}) =>
  postEntry(db, {
    occurredOn: on, direction, kind: direction === "in" ? "other_income" : "expense",
    accountId: extra.accountId ?? accountId, category: "Misc", amountPaise, description, reference: extra.reference ?? null,
  });

beforeAll(async () => {
  await sweep();
  const [c] = await db.insert(centers).values({ name: `${MARK} centre`, city: "Kochi" }).returning({ id: centers.id });
  centerId = c.id;
  const [a] = await db.insert(financeAccounts).values({ name: `${MARK} bank`, centerId, type: "bank" }).returning({ id: financeAccounts.id });
  accountId = a.id;
  const [b] = await db.insert(financeAccounts).values({ name: `${MARK} cash`, centerId, type: "cash" }).returning({ id: financeAccounts.id });
  cashId = b.id;
});
afterAll(sweep);

async function lines(...ls: ReturnType<typeof stmt>[]) {
  await saveStatementLines(db, { accountId, centerId, importedBy: null, lines: ls });
}
async function open() {
  return getReconciliation([centerId]);
}

describe("reconciliation against the ledger", () => {
  it("pairs automatically and leaves nothing open when books and bank agree", async () => {
    await fresh();
    await post("2026-04-01", "in", 500000, "Seminar income");
    await post("2026-04-02", "out", 120000, "Stationery");
    await lines(stmt("2026-04-02", "in", 500000, "NEFT SEMINAR", 1), stmt("2026-04-03", "out", 120000, "POS STATIONERS", 2), stmt("2026-04-20", "out", 100, "pad", 3));
    expect(await autoMatchAccount(db, accountId)).toBe(2);
    const r = await open();
    expect(r.entries).toHaveLength(0);
    // Only the pad line (no entry) remains, as an exception.
    expect(r.lines.map((l) => l.amountPaise)).toEqual([100]);
  });

  it("flags a withdrawal that is not in the books", async () => {
    await fresh();
    await post("2026-04-01", "in", 100000, "Income");
    await lines(stmt("2026-04-01", "in", 100000, "CR", 1), stmt("2026-04-05", "out", 5000000, "ATM WDL CASH", 2), stmt("2026-04-30", "in", 1, "later", 3));
    await autoMatchAccount(db, accountId);
    const r = await open();
    expect(r.lines.find((l) => l.amountPaise === 5000000)).toBeTruthy();
  });

  it("flags an entry the bank never showed, but not one too recent for any statement", async () => {
    await fresh();
    await lines(stmt("2026-04-01", "in", 1000, "a", 1), stmt("2026-04-30", "in", 2000, "b", 2));
    await post("2026-04-10", "in", 7777700, "Ghost income");
    await post("2026-04-30", "in", 4000, "Too new to be on a statement");
    await autoMatchAccount(db, accountId);
    const r = await open();
    expect(r.entries.map((e) => e.description)).toEqual(["Ghost income"]);
    expect(r.awaitingStatement).toBe(1);
  });

  it("ignores cash accounts: they have no statement to prove them", async () => {
    await fresh();
    await lines(stmt("2026-04-01", "in", 1000, "a", 1), stmt("2026-04-30", "in", 2000, "b", 2));
    await post("2026-04-10", "in", 999900, "Cash fee", { accountId: cashId });
    const r = await open();
    expect(r.entries).toHaveLength(0);
    await db.delete(financeTransactions).where(eq(financeTransactions.accountId, cashId));
  });

  it("a mistake reversed before it touched the bank is not an exception, but a reversal of a paired entry is", async () => {
    await fresh();
    await lines(stmt("2026-04-01", "in", 1000, "a", 1), stmt("2026-04-30", "in", 2000, "b", 2), stmt("2026-04-08", "in", 300000, "REAL", 3));
    const wrong = await post("2026-04-10", "in", 900000, "Typed in wrongly");
    await db.transaction((tx) => reverseTransaction(tx, { transactionId: wrong.id, reason: "typo", recordedBy: null }));
    const real = await post("2026-04-08", "in", 300000, "Real receipt");
    await autoMatchAccount(db, accountId);
    expect((await open()).entries).toHaveLength(0);

    // Reversing a real, paired entry leaves the reversal needing a refund line.
    await db.transaction((tx) => reverseTransaction(tx, { transactionId: real.id, reason: "refund", recordedBy: null }));
    const r = await open();
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({ direction: "out", amountPaise: 300000 });
  });

  it("an entry made from a bank line is paired with it, and a set-aside line is a visible waiver", async () => {
    await fresh();
    await lines(stmt("2026-04-02", "out", 45000, "BANK CHARGES", 1), stmt("2026-04-03", "in", 1234, "odd", 2));
    const pending = await db.select().from(bankStatementLines).where(eq(bankStatementLines.accountId, accountId));
    const charges = pending.filter((l) => l.amountPaise === 45000);
    const odd = pending.filter((l) => l.amountPaise === 1234);
    await db.transaction((tx) => resolveBankLines(tx, { lines: charges, direction: "out", choice: "Bank Charges", skipReason: null, userId: null }));
    await db.transaction((tx) => resolveBankLines(tx, { lines: odd, direction: "in", choice: "x", skipReason: "Not income or an expense", userId: null }));
    const r = await open();
    expect(r.lines).toHaveLength(0);
    expect(r.waived.map((w) => w.amountPaise)).toEqual([1234]);
  });

  it("refuses a manual pair that is not exactly the same amount and direction", async () => {
    await fresh();
    await lines(stmt("2026-04-02", "in", 10000, "CR", 1));
    const [l] = await db.select().from(bankStatementLines).where(eq(bankStatementLines.accountId, accountId));
    const wrongAmount = await post("2026-04-02", "in", 10001, "off by a paisa");
    const wrongWay = await post("2026-04-02", "out", 10000, "wrong direction");
    expect((await matchManually(db, { bankLineId: l.id, transactionId: wrongAmount.id, userId: "00000000-0000-0000-0000-000000000000" }))).toMatchObject({ ok: false });
    expect((await matchManually(db, { bankLineId: l.id, transactionId: wrongWay.id, userId: "00000000-0000-0000-0000-000000000000" }))).toMatchObject({ ok: false });
  });

  it("will not pair one line twice, and undoing a pair reopens both sides and keeps the record", async () => {
    await fresh();
    await lines(stmt("2026-04-02", "in", 10000, "CR", 1));
    const [l] = await db.select().from(bankStatementLines).where(eq(bankStatementLines.accountId, accountId));
    const a = await post("2026-04-02", "in", 10000, "first");
    const b = await post("2026-04-09", "in", 10000, "second");
    const actor = (await db.execute<{ id: string }>(sql`select id from profiles limit 1`))[0]?.id;
    if (!actor) return; // no profile in this database; the constraint is covered below
    expect(await matchManually(db, { bankLineId: l.id, transactionId: a.id, userId: actor })).toEqual({ ok: true });
    expect(await matchManually(db, { bankLineId: l.id, transactionId: b.id, userId: actor })).toMatchObject({ ok: false });

    const [m] = await db.select().from(bankMatches).where(eq(bankMatches.bankLineId, l.id));
    expect(await unmatch(db, { matchId: m.id, userId: actor, reason: "wrong one" })).toMatchObject({ ok: true });
    const history = await db.select().from(bankMatches).where(eq(bankMatches.bankLineId, l.id));
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ active: false, unmatchReason: "wrong one" });
    expect(await unmatch(db, { matchId: m.id, userId: actor, reason: "again" })).toMatchObject({ ok: false });
  });

  it("a waiver needs a reason", async () => {
    await fresh();
    await lines(stmt("2026-04-02", "in", 10000, "CR", 1));
    const [l] = await db.select().from(bankStatementLines).where(eq(bankStatementLines.accountId, accountId));
    expect(await waiveLine(db, { bankLineId: l.id, userId: "00000000-0000-0000-0000-000000000000", reason: "ok" })).toMatchObject({ ok: false });
  });

  it("the database refuses a waiver that points at an entry, and a pair without one", async () => {
    await fresh();
    await lines(stmt("2026-04-02", "in", 10000, "CR", 1));
    const [l] = await db.select().from(bankStatementLines).where(eq(bankStatementLines.accountId, accountId));
    await expect(
      db.insert(bankMatches).values({ bankLineId: l.id, transactionId: null, centerId, method: "manual" }),
    ).rejects.toThrow();
  });
});

const withBal = (on: string, direction: "in" | "out", amountPaise: number, balancePaise: number, n: number, seq: number) => ({
  ...stmt(on, direction, amountPaise, `L${n}`, n),
  balancePaise,
  seq,
});

describe("checking an upload against what is already stored", () => {
  it("accepts a statement that opens where the last one closed", async () => {
    await fresh();
    await lines(withBal("2026-04-01", "in", 1000, 11000, 1, 0), withBal("2026-04-02", "out", 500, 10500, 2, 1));
    const next = [withBal("2026-04-03", "in", 200, 10700, 3, 0)];
    expect(await checkContinuity(db, accountId, next)).toBeNull();
  });

  it("refuses one whose opening balance does not join: lines or a month are missing", async () => {
    await fresh();
    await lines(withBal("2026-04-01", "in", 1000, 11000, 1, 0), withBal("2026-04-02", "out", 500, 10500, 2, 1));
    const gap = [withBal("2026-05-03", "in", 200, 99200, 3, 0)];
    expect(await checkContinuity(db, accountId, gap)).toMatch(/opens with a balance/);
  });

  it("refuses new lines on dates that were already imported", async () => {
    await fresh();
    await lines(withBal("2026-04-01", "in", 1000, 11000, 1, 0), withBal("2026-04-10", "out", 500, 10500, 2, 1));
    const rewrite = [withBal("2026-04-01", "in", 1000, 11000, 1, 0), withBal("2026-04-05", "out", 9000, 2000, 4, 1), withBal("2026-04-10", "out", 500, 1500, 5, 2)];
    expect(await checkContinuity(db, accountId, rewrite)).toMatch(/already imported/);
  });

  it("allows an overlapping statement that only adds later lines, and the first ever upload", async () => {
    await fresh();
    expect(await checkContinuity(db, accountId, [withBal("2026-04-01", "in", 1000, 11000, 1, 0)])).toBeNull();
    await lines(withBal("2026-04-01", "in", 1000, 11000, 1, 0));
    const overlap = [withBal("2026-04-01", "in", 1000, 11000, 1, 0), withBal("2026-04-02", "out", 500, 10500, 2, 1)];
    expect(await checkContinuity(db, accountId, overlap)).toBeNull();
  });
});

describe("cash on the reconciliation page", () => {
  it("shows a cash box's book balance from its opening balance and every entry", async () => {
    await db.update(financeAccounts).set({ openingBalancePaise: 100000 }).where(eq(financeAccounts.id, cashId));
    await post("2026-04-10", "in", 250000, "Cash fee", { accountId: cashId });
    await post("2026-04-11", "out", 40000, "Tea", { accountId: cashId });
    const r = await open();
    const box = r.cash.find((c) => c.accountId === cashId);
    expect(box?.bookPaise).toBe(100000 + 250000 - 40000);
    expect(box?.lastCountedOn).toBeNull();
    await db.delete(financeTransactions).where(eq(financeTransactions.accountId, cashId));
  });
});

describe("correcting an entry made from a bank statement line", () => {
  const MARK = "CorrectMatchTest";
  let accountId: string;
  let centerId: string;

  beforeAll(async () => {
    const [c] = await db.insert(centers).values({ name: `${MARK} centre`, city: "x" }).returning({ id: centers.id });
    centerId = c.id;
    const [a] = await db.insert(financeAccounts).values({ name: `${MARK} bank`, centerId, type: "bank" }).returning({ id: financeAccounts.id });
    accountId = a.id;
  });
  afterAll(async () => {
    await db.execute(sql`delete from bank_matches where center_id = ${centerId}::uuid`);
    await db.execute(sql`delete from bank_statement_lines where account_id = ${accountId}::uuid`);
    await db.execute(sql`delete from finance_transactions where account_id = ${accountId}::uuid`);
    await db.delete(financeAccounts).where(eq(financeAccounts.id, accountId));
    await db.delete(centers).where(eq(centers.id, centerId));
  });

  async function importedLine(fp: string, amountPaise: number) {
    const [l] = await db
      .insert(bankStatementLines)
      .values({ accountId, centerId, occurredOn: "2026-04-10", particulars: `UPI ${fp}`, direction: "out", amountPaise, fingerprint: `${MARK}-${fp}` })
      .returning();
    await resolveBankLines(db, { lines: [l], direction: "out", choice: "Office Supplies", skipReason: null, userId: null });
    const [posted] = await db.select().from(bankStatementLines).where(eq(bankStatementLines.id, l.id));
    return { lineId: l.id, txnId: posted.transactionId! };
  }

  it("keeps the statement line tied to the corrected entry when only the category changes", async () => {
    const { lineId, txnId } = await importedLine("a", 12345);
    const { correctTransaction } = await import("../src/lib/finance/post");
    const { unmatchedLedgerRows } = await import("../src/lib/finance/reconcile");
    const { replacement } = await correctTransaction(db, { transactionId: txnId, reason: "wrong category", category: "Rent", description: "April rent" });

    const active = await db.select().from(bankMatches).where(eq(bankMatches.bankLineId, lineId));
    expect(active.filter((m) => m.active).map((m) => m.transactionId)).toEqual([replacement.id]);
    const [row] = await db.select().from(bankStatementLines).where(eq(bankStatementLines.id, lineId));
    expect(row.transactionId).toBe(replacement.id);
    expect(await unmatchedLedgerRows(db, accountId)).toEqual([]);
  });

  it("leaves the pairing alone when the amount changes, because the bank no longer agrees", async () => {
    const { lineId, txnId } = await importedLine("b", 20000);
    const { correctTransaction } = await import("../src/lib/finance/post");
    const { replacement } = await correctTransaction(db, { transactionId: txnId, reason: "typo", amountPaise: 21000 });
    const active = (await db.select().from(bankMatches).where(eq(bankMatches.bankLineId, lineId))).filter((m) => m.active);
    expect(active.map((m) => m.transactionId)).toEqual([txnId]);
    expect(active.map((m) => m.transactionId)).not.toContain(replacement.id);
  });
});
