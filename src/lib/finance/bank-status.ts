import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Whether a piece of money is backed by the bank, for showing beside it.
 *
 *  - `matched`    a statement line proves it
 *  - `unmatched`  it went into a bank account and no statement line proves it (yet)
 *  - `cash`       it went into a cash box, which has no statement
 *  - `none`       it was never put in any account
 *
 * Read through the caller's RLS client, so only somebody who can see finance
 * should be shown it: for anybody else every answer would read `none`.
 */
export type BankStatus = "matched" | "unmatched" | "cash" | "none";

export async function bankStatusForTransactions(
  supabase: SupabaseClient,
  rows: Array<{ id: string; accountId: string }>,
): Promise<Map<string, BankStatus>> {
  const result = new Map<string, BankStatus>();
  if (rows.length === 0) return result;

  const accountIds = [...new Set(rows.map((r) => r.accountId))];
  const ids = rows.map((r) => r.id);
  const [{ data: accounts }, { data: matches }] = await Promise.all([
    supabase.from("finance_accounts").select("id, type").in("id", accountIds),
    supabase.from("bank_matches").select("transaction_id").eq("active", true).in("transaction_id", ids),
  ]);
  const typeOf = new Map((accounts ?? []).map((a) => [a.id as string, a.type as string]));
  const matched = new Set((matches ?? []).map((m) => m.transaction_id as string));

  for (const r of rows) {
    const type = typeOf.get(r.accountId);
    result.set(r.id, matched.has(r.id) ? "matched" : type === "bank" ? "unmatched" : "cash");
  }
  return result;
}

/** The same for student payments, through the ledger entry each one produced. */
export async function bankStatusForPayments(
  supabase: SupabaseClient,
  paymentIds: string[],
): Promise<Map<string, BankStatus>> {
  const result = new Map<string, BankStatus>(paymentIds.map((id) => [id, "none"]));
  if (paymentIds.length === 0) return result;

  const { data: txns } = await supabase
    .from("finance_transactions")
    .select("id, account_id, payment_id")
    .in("payment_id", paymentIds);
  const rows = (txns ?? []).map((t) => ({ id: t.id as string, accountId: t.account_id as string, paymentId: t.payment_id as string }));
  const byTxn = await bankStatusForTransactions(supabase, rows);
  for (const r of rows) result.set(r.paymentId, byTxn.get(r.id) ?? "none");
  return result;
}

export const BANK_STATUS_LABEL: Record<BankStatus, string> = {
  matched: "On bank statement",
  unmatched: "Not on bank statement",
  cash: "Cash",
  none: "Not in any account",
};
