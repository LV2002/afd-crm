"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser, scopeFor, type SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { bankBalanceChecks, bankMatches, bankStatementLines, cashCounts, financeAccounts } from "@/lib/db/schema";
import { parseRupeesToPaise } from "@/lib/format/currency";
import { sql } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";

import { autoMatchAccount, matchManually, unmatch, waiveLine } from "./reconcile";

export interface ReconcileFormState {
  error?: string;
  success?: string;
}

function revalidate() {
  revalidatePath("/finance/reconcile");
  revalidatePath("/finance/bank");
  revalidatePath("/finance/transactions");
}

async function reviewer(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  return user && can(user, "bank.reconcile") ? user : null;
}

/** Whether this reviewer may touch an account's centre. */
function inScope(user: SessionUser, centerId: string): boolean {
  return scopeFor(user, "bank.reconcile") === "all" || user.centerIds.includes(centerId);
}

async function audit(user: SessionUser, action: string, entityId: string, after: Record<string, unknown>) {
  const supabase = await createClient();
  await writeAuditLog(supabase, { actorId: user.id, action, entityType: "bank_matches", entityId, after });
}

export async function matchLine(_prev: ReconcileFormState, formData: FormData): Promise<ReconcileFormState> {
  const user = await reviewer();
  if (!user) return { error: "You don't have permission to do that." };
  const bankLineId = String(formData.get("bankLineId") ?? "");
  const transactionId = String(formData.get("transactionId") ?? "");
  if (!bankLineId || !transactionId) return { error: "Pick the entry to pair it with." };

  const [line] = await db.select().from(bankStatementLines).where(eq(bankStatementLines.id, bankLineId));
  if (!line || !inScope(user, line.centerId)) return { error: "That line is outside your centre." };

  const result = await matchManually(db, { bankLineId, transactionId, userId: user.id });
  if (!result.ok) return { error: result.error };
  await audit(user, "finance.bank_match", bankLineId, { transactionId, method: "manual" });
  revalidate();
  return { success: "Paired." };
}

export async function waiveStatementLine(_prev: ReconcileFormState, formData: FormData): Promise<ReconcileFormState> {
  const user = await reviewer();
  if (!user) return { error: "You don't have permission to do that." };
  const bankLineId = String(formData.get("bankLineId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const [line] = await db.select().from(bankStatementLines).where(eq(bankStatementLines.id, bankLineId));
  if (!line || !inScope(user, line.centerId)) return { error: "That line is outside your centre." };

  const result = await waiveLine(db, { bankLineId, userId: user.id, reason });
  if (!result.ok) return { error: result.error };
  await audit(user, "finance.bank_waive", bankLineId, { reason });
  revalidate();
  return { success: "Accepted as having no entry." };
}

export async function undoPair(_prev: ReconcileFormState, formData: FormData): Promise<ReconcileFormState> {
  const user = await reviewer();
  if (!user) return { error: "You don't have permission to do that." };
  const matchId = String(formData.get("matchId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const [match] = await db.select().from(bankMatches).where(eq(bankMatches.id, matchId));
  if (!match || !inScope(user, match.centerId)) return { error: "That pair is outside your centre." };

  const result = await unmatch(db, { matchId, userId: user.id, reason });
  if (!result.ok) return { error: result.error };
  await audit(user, "finance.bank_unmatch", matchId, { reason, method: match.method });
  revalidate();
  return { success: "Undone. Both sides are open again." };
}

export async function runMatching(_prev: ReconcileFormState, formData: FormData): Promise<ReconcileFormState> {
  const user = await reviewer();
  if (!user) return { error: "You don't have permission to do that." };
  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) return { error: "Which account?" };
  const paired = await autoMatchAccount(db, accountId);
  if (paired > 0) await audit(user, "finance.bank_auto_match", accountId, { paired });
  revalidate();
  return { success: paired === 0 ? "Nothing more can be paired without guessing." : `Paired ${paired}.` };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Records the balance somebody read off the bank's own app, beside what the
 * imported statement says it was that day. The one check that does not rely
 * on the statement file being honest.
 */
export async function confirmBankBalance(_prev: ReconcileFormState, formData: FormData): Promise<ReconcileFormState> {
  const user = await reviewer();
  if (!user) return { error: "You don't have permission to do that." };
  const accountId = String(formData.get("accountId") ?? "");
  const asOf = String(formData.get("asOf") ?? "");
  const bankPaise = parseRupeesToPaise(String(formData.get("balance") ?? ""));
  if (!DATE.test(asOf)) return { error: "Pick the date the balance is for." };
  if (bankPaise === null) return { error: "Enter the balance as shown by the bank." };

  const [account] = await db.select().from(financeAccounts).where(eq(financeAccounts.id, accountId));
  if (!account || account.type !== "bank" || !inScope(user, account.centerId)) return { error: "That account is outside your centre." };

  const [line] = await db.execute<{ balance_paise: string | null }>(sql`
    select balance_paise from bank_statement_lines
    where account_id = ${accountId}::uuid and occurred_on <= ${asOf}::date and balance_paise is not null
    order by occurred_on desc, imported_at desc, seq desc nulls last
    limit 1
  `);
  const statementPaise = line?.balance_paise === undefined || line?.balance_paise === null ? null : Number(line.balance_paise);

  await db.insert(bankBalanceChecks).values({
    accountId,
    centerId: account.centerId,
    asOf,
    bankBalancePaise: bankPaise,
    statementBalancePaise: statementPaise,
    note: String(formData.get("note") ?? "").trim() || null,
    checkedBy: user.id,
  });
  await audit(user, "finance.bank_balance_check", accountId, { asOf, bankPaise, statementPaise });
  revalidate();
  if (statementPaise === null) return { success: "Recorded, but the imported statement doesn't reach that date yet." };
  return statementPaise === bankPaise
    ? { success: "The statement agrees with the bank." }
    : { error: `The statement says ₹${(statementPaise / 100).toLocaleString("en-IN")} but the bank says ₹${(bankPaise / 100).toLocaleString("en-IN")}. Recorded, and shown as open until a later check agrees.` };
}

/** A count of the physical cash, set against what the books say the box should hold. */
export async function countCash(_prev: ReconcileFormState, formData: FormData): Promise<ReconcileFormState> {
  const user = await reviewer();
  if (!user) return { error: "You don't have permission to do that." };
  const accountId = String(formData.get("accountId") ?? "");
  const countedOn = String(formData.get("countedOn") ?? "");
  const countedPaise = parseRupeesToPaise(String(formData.get("counted") ?? ""));
  const note = String(formData.get("note") ?? "").trim();
  if (!DATE.test(countedOn)) return { error: "Pick the date of the count." };
  if (countedPaise === null || countedPaise < 0) return { error: "Enter the amount you counted." };

  const [account] = await db.select().from(financeAccounts).where(eq(financeAccounts.id, accountId));
  if (!account || account.type === "bank" || !inScope(user, account.centerId)) return { error: "That cash box is outside your centre." };

  const [row] = await db.execute<{ book: string }>(sql`
    select ${account.openingBalancePaise}::bigint + coalesce(sum(case when direction in ('in','transfer_in') then amount_paise else -amount_paise end), 0) as book
    from finance_transactions where account_id = ${accountId}::uuid and occurred_on <= ${countedOn}::date
  `);
  const expectedPaise = Number(row?.book ?? 0);
  const variance = countedPaise - expectedPaise;
  if (variance !== 0 && note.length < 5) {
    return { error: `The books say ₹${(expectedPaise / 100).toLocaleString("en-IN")} and you counted ₹${(countedPaise / 100).toLocaleString("en-IN")}. Say what you think explains the difference before saving.` };
  }

  await db.insert(cashCounts).values({
    accountId,
    centerId: account.centerId,
    countedOn,
    countedPaise,
    expectedPaise,
    note: note || null,
    countedBy: user.id,
  });
  await audit(user, "finance.cash_count", accountId, { countedOn, countedPaise, expectedPaise, variance });
  revalidate();
  return { success: variance === 0 ? "The cash agrees with the books." : `Recorded: ${variance > 0 ? "over" : "short"} by ₹${(Math.abs(variance) / 100).toLocaleString("en-IN")}.` };
}
