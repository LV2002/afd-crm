/**
 * A statement line that has been paired, or accepted as having no entry, is
 * dealt with and leaves "To categorise". Real database.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { config as loadEnv } from "dotenv";
import { eq, like, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const { db } = await import("../src/lib/db/client");
const s = await import("../src/lib/db/schema");
const { resolveBankLines, saveStatementLines } = await import("../src/lib/finance/bank-ledger");
const { postEntry, reverseTransaction } = await import("../src/lib/finance/post");
const { autoMatchAccount, matchManually, unmatch, waiveLine } = await import("../src/lib/finance/reconcile");
const { createTestUsers } = await import("./helpers/fixture-users");

const MARK = "MatchStatusTest";
let userId: string;
let cleanupUsers: (() => Promise<void>) | undefined;
let centerId: string;
let accountId: string;

const fp = (n: number) => `ms-${n}-`.padEnd(64, "0");
async function line(n: number, over: Record<string, unknown> = {}) {
  await saveStatementLines(db, {
    accountId, centerId, importedBy: null,
    lines: [{ occurredOn: "2026-11-10", particulars: `LINE ${n}`, direction: "out", amountPaise: 1_000_00 + n, balancePaise: null, note: null, dateGuessed: false, fingerprint: fp(n), ...over } as never],
  });
  const [row] = await db.select().from(s.bankStatementLines).where(eq(s.bankStatementLines.fingerprint, fp(n)));
  return row;
}
const statusOf = async (id: string) => (await db.select().from(s.bankStatementLines).where(eq(s.bankStatementLines.id, id)))[0].status;
const entry = (amountPaise: number, over: Record<string, unknown> = {}) =>
  db.transaction((tx) => postEntry(tx, { occurredOn: "2026-11-10", direction: "out", kind: "expense", accountId, category: "Google Ads", amountPaise, description: "t", ...over } as never));

async function sweep() {
  const accts = await db.select({ id: s.financeAccounts.id }).from(s.financeAccounts).where(like(s.financeAccounts.name, `${MARK}%`));
  for (const a of accts) {
    await db.delete(s.bankMatches).where(eq(s.bankMatches.centerId, centerId ?? a.id));
    await db.delete(s.bankStatementLines).where(eq(s.bankStatementLines.accountId, a.id));
    await db.delete(s.financeTransactions).where(eq(s.financeTransactions.accountId, a.id));
  }
  await db.delete(s.financeAccounts).where(like(s.financeAccounts.name, `${MARK}%`));
  await db.delete(s.centers).where(like(s.centers.name, `${MARK}%`));
}

beforeAll(async () => {
  await sweep();
  const users = await createTestUsers(["accounts"]);
  cleanupUsers = users.cleanup;
  userId = users.ids[0];
  centerId = (await db.insert(s.centers).values({ name: `${MARK} centre`, city: "Kochi" }).returning({ id: s.centers.id }))[0].id;
  accountId = (await db.insert(s.financeAccounts).values({ name: `${MARK} bank`, centerId, type: "bank" }).returning({ id: s.financeAccounts.id }))[0].id;
});
afterAll(async () => {
  await sweep();
  await cleanupUsers?.();
});

describe("pairing takes a line out of the list to categorise", () => {
  it("does so when the automatic matcher pairs it", async () => {
    const l = await line(1);
    await entry(l.amountPaise);
    expect(await statusOf(l.id)).toBe("pending");
    expect(await db.transaction((tx) => autoMatchAccount(tx, accountId))).toBeGreaterThanOrEqual(1);
    expect(await statusOf(l.id)).toBe("posted");
  });

  it("does so for a failed payment's credit, paired by hand with the reversal of the expense", async () => {
    const original = await entry(500_000, { occurredOn: "2026-11-01" });
    const reversed = await db.transaction((tx) => reverseTransaction(tx, { transactionId: original.id, reason: "payment failed, money returned", recordedBy: userId }));
    // Money came back ten days later: outside the automatic window, so it is paired by hand.
    const credit = await line(2, { direction: "in", amountPaise: 500_000, occurredOn: "2026-11-11" });
    expect(await statusOf(credit.id)).toBe("pending");
    const result = await db.transaction((tx) => matchManually(tx, { bankLineId: credit.id, transactionId: reversed.reversal.id, userId }));
    expect(result).toEqual({ ok: true });
    expect(await statusOf(credit.id)).toBe("posted");
  });

  it("does so when a line is accepted as having no entry, and keeps the reason", async () => {
    const l = await line(3);
    expect(await db.transaction((tx) => waiveLine(tx, { bankLineId: l.id, userId, reason: "Failed payment, reversed by the bank" }))).toEqual({ ok: true });
    const [row] = await db.select().from(s.bankStatementLines).where(eq(s.bankStatementLines.id, l.id));
    expect(row).toMatchObject({ status: "skipped", skipReason: "Failed payment, reversed by the bank" });
  });
});

describe("undoing a pairing", () => {
  it("puts a line paired in Reconciliation back in the list", async () => {
    const l = await line(4);
    const e = await entry(l.amountPaise);
    await db.transaction((tx) => matchManually(tx, { bankLineId: l.id, transactionId: e.id, userId }));
    const [m] = await db.select().from(s.bankMatches).where(eq(s.bankMatches.bankLineId, l.id));
    await db.transaction((tx) => unmatch(tx, { matchId: m.id, userId, reason: "paired the wrong one" }));
    expect(await statusOf(l.id)).toBe("pending");
  });

  it("does NOT put a categorised line back, because it already made its own entry", async () => {
    const l = await line(5);
    await db.transaction((tx) => resolveBankLines(tx, { lines: [l], direction: "out", choice: "Rent", skipReason: null, userId }));
    const [m] = await db.select().from(s.bankMatches).where(eq(s.bankMatches.bankLineId, l.id));
    expect(m.method).toBe("categorised");
    await db.transaction((tx) => unmatch(tx, { matchId: m.id, userId, reason: "checking it comes apart" }));
    expect(await statusOf(l.id)).toBe("posted");
  });
});

describe("the repair for lines already stranded", () => {
  it("marks paired and waived lines that were left pending, and nothing else", async () => {
    const paired = await line(6);
    const waived = await line(7);
    const open = await line(8);
    const e = await entry(paired.amountPaise);
    // The old behaviour: pairs recorded, lines left pending.
    await db.insert(s.bankMatches).values({ bankLineId: paired.id, transactionId: e.id, centerId, method: "manual", matchedBy: userId });
    await db.insert(s.bankMatches).values({ bankLineId: waived.id, transactionId: null, centerId, method: "waived", matchedBy: userId, note: "old waiver" });
    const file = readFileSync(join(__dirname, "../src/lib/db/migrations/0142_paired_lines_leave_queue.sql"), "utf8");
    for (const statement of file.split("--> statement-breakpoint")) {
      const body = statement.split("\n").filter((x) => !x.trim().startsWith("--")).join("\n").trim();
      if (body) await db.execute(sql.raw(body));
    }
    expect(await statusOf(paired.id)).toBe("posted");
    expect(await statusOf(waived.id)).toBe("skipped");
    expect(await statusOf(open.id)).toBe("pending");
    const [w] = await db.select().from(s.bankStatementLines).where(eq(s.bankStatementLines.id, waived.id));
    expect(w.skipReason).toBe("old waiver");
  });
});
