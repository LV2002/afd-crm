/**
 * Integration tests for the bank import's two writes — needs a real
 * database with migrations applied (see confirm-admission.spec.ts).
 */
import { config as loadEnv } from "dotenv";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const { db } = await import("../src/lib/db/client");
const { bankStatementLines, centers, financeAccounts, financeTransactions } = await import(
  "../src/lib/db/schema"
);
const { resolveBankLines, saveStatementLines } = await import("../src/lib/finance/bank-ledger");
const { parseBankStatement } = await import("../src/lib/finance/bank-statement");

const MARKER = "BankLedgerTest";
let centerId: string;
let accountId: string;

async function sweep() {
  const accts = await db.select({ id: financeAccounts.id }).from(financeAccounts).where(like(financeAccounts.name, `${MARKER}%`));
  for (const a of accts) {
    await db.delete(bankStatementLines).where(eq(bankStatementLines.accountId, a.id));
    // The ledger is append-only for the app's roles; the test owns the DB.
    await db.delete(financeTransactions).where(eq(financeTransactions.accountId, a.id));
  }
  await db.delete(financeAccounts).where(like(financeAccounts.name, `${MARKER}%`));
  await db.delete(centers).where(like(centers.name, `${MARKER}%`));
}

beforeAll(async () => {
  await sweep();
  const [c] = await db.insert(centers).values({ name: `${MARKER} centre`, city: "Kochi" }).returning({ id: centers.id });
  centerId = c.id;
  const [a] = await db
    .insert(financeAccounts)
    .values({ name: `${MARKER} bank`, centerId, type: "bank" })
    .returning({ id: financeAccounts.id });
  accountId = a.id;
});
afterAll(sweep);

const CSV = [
  "Date,Particulars,Transaction Type,Amount,Balance",
  "02-Nov-2026,GOOGLE ADS,Credit,\"₹1,000.00\",11000.00",
  "01-Nov-2026,RENT,Debit,₹400.00,10000.00",
].join("\n");

describe("bank import", () => {
  it("saves new lines once, however many times the file is uploaded", async () => {
    const lines = parseBankStatement(CSV).lines;
    expect(await saveStatementLines(db, { accountId, centerId, importedBy: null, lines })).toBe(2);
    expect(await saveStatementLines(db, { accountId, centerId, importedBy: null, lines })).toBe(0);
    const rows = await db.select().from(bankStatementLines).where(eq(bankStatementLines.accountId, accountId));
    expect(rows).toHaveLength(2);
  });

  it("posts a categorised line to the ledger exactly once, even when asked twice", async () => {
    const pending = await db.select().from(bankStatementLines).where(eq(bankStatementLines.accountId, accountId));
    const credit = pending.filter((l) => l.direction === "in");

    const first = await db.transaction((tx) =>
      resolveBankLines(tx, { lines: credit, direction: "in", choice: "Other Income", skipReason: null, userId: null }),
    );
    // A second accountant clicking the same row a moment later.
    const second = await db.transaction((tx) =>
      resolveBankLines(tx, { lines: credit, direction: "in", choice: "Other Income", skipReason: null, userId: null }),
    );
    expect([first, second]).toEqual([1, 0]);

    const ledger = await db.select().from(financeTransactions).where(eq(financeTransactions.accountId, accountId));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      direction: "in",
      kind: "other_income",
      category: "Other Income",
      amountPaise: 100000,
      centerId,
      source: "bank_statement",
    });

    const [line] = await db.select().from(bankStatementLines).where(eq(bankStatementLines.id, credit[0].id));
    expect(line).toMatchObject({ status: "posted", transactionId: ledger[0].id });
  });

  it("sets a line aside without touching the ledger", async () => {
    const [debit] = await db
      .select()
      .from(bankStatementLines)
      .where(eq(bankStatementLines.accountId, accountId))
      .then((rows) => rows.filter((r) => r.direction === "out"));
    const n = await db.transaction((tx) =>
      resolveBankLines(tx, { lines: [debit], direction: "out", choice: "skip:other", skipReason: "Not income or an expense", userId: null }),
    );
    expect(n).toBe(1);
    const ledger = await db.select().from(financeTransactions).where(eq(financeTransactions.accountId, accountId));
    expect(ledger).toHaveLength(1);
    const [after] = await db.select().from(bankStatementLines).where(eq(bankStatementLines.id, debit.id));
    expect(after).toMatchObject({ status: "skipped", transactionId: null });
  });
});
