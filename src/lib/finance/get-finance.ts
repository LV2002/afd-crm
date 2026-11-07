import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  accountBalance,
  isPettyCashLow,
  type FinanceDirection,
  type FinanceKind,
} from "./ledger-math";

/**
 * Reads for the finance screens.
 *
 * Every one of these goes through the caller's RLS-bound Supabase client,
 * never the direct connection. That is the whole difference from the
 * spreadsheet: there, protection stopped editing but not reading, so any
 * staff member could open the Dashboard and see the bank balance. Here the
 * database decides, and a counsellor's query returns nothing.
 *
 * Aggregation happens in TypeScript rather than SQL. At AFD's volume — a
 * few thousand entries a year — pulling the narrow columns and summing
 * them is simpler than a view per report, and it keeps the arithmetic in
 * `ledger-math.ts` where it is unit-tested. If this ever gets slow, the
 * fix is a materialised monthly summary, not scattering SUM() through the
 * pages.
 */

export interface AccountRow {
  id: string;
  name: string;
  center_id: string;
  type: "bank" | "cash" | "petty_cash";
  opening_balance_paise: number;
  opening_as_of: string | null;
  float_paise: number | null;
  is_active: boolean;
}

export interface LedgerRow {
  id: string;
  txn_no: number;
  occurred_on: string;
  direction: FinanceDirection;
  kind: FinanceKind;
  account_id: string;
  center_id: string;
  category: string;
  amount_paise: number;
  description: string;
  reference: string | null;
  student_name: string | null;
  course: string | null;
  payment_id: string | null;
  transfer_group_id: string | null;
  reverses_transaction_id: string | null;
  created_at: string;
}

const LEDGER_COLUMNS =
  "id, txn_no, occurred_on, direction, kind, account_id, center_id, category, amount_paise, description, reference, student_name, course, payment_id, transfer_group_id, reverses_transaction_id, created_at";

export async function getAccounts(
  supabase: SupabaseClient,
  options: { includeInactive?: boolean } = {},
): Promise<AccountRow[]> {
  let query = supabase
    .from("finance_accounts")
    .select("id, name, center_id, type, opening_balance_paise, opening_as_of, float_paise, is_active")
    .is("deleted_at", null)
    .order("name");

  if (!options.includeInactive) query = query.eq("is_active", true);

  const { data } = await query.returns<AccountRow[]>();
  return data ?? [];
}

export interface AccountWithBalance extends AccountRow {
  centerName: string | null;
  balancePaise: number;
  entryCount: number;
  /** Petty cash below a fifth of its float — the workbook's own threshold. */
  needsTopUp: boolean;
}

/**
 * Every account with its live balance: opening plus the ledger.
 *
 * Never a stored counter. A counter and a ledger disagree eventually, and
 * when they do there is no way to tell which one lied.
 */
export async function getAccountsWithBalances(
  supabase: SupabaseClient,
  options: { includeInactive?: boolean; centerId?: string } = {},
): Promise<AccountWithBalance[]> {
  const [allAccounts, { data: entries }, { data: centers }] = await Promise.all([
    getAccounts(supabase, options),
    supabase
      .from("finance_transactions")
      .select("account_id, direction, amount_paise, occurred_on")
      .returns<Array<{ account_id: string; direction: FinanceDirection; amount_paise: number; occurred_on: string }>>(),
    supabase.from("centers").select("id, name").returns<Array<{ id: string; name: string }>>(),
  ]);

  const accounts = options.centerId
    ? allAccounts.filter((a) => a.center_id === options.centerId)
    : allAccounts;

  // The opening balance is struck on a date: entries on or before it are
  // already inside it (or belong to an earlier year), so they stay out of
  // the balance while every report still counts them.
  const openingAsOf = new Map(allAccounts.map((a) => [a.id, a.opening_as_of]));
  const byAccount = new Map<string, Array<{ direction: FinanceDirection; amountPaise: number }>>();
  for (const entry of entries ?? []) {
    const asOf = openingAsOf.get(entry.account_id);
    if (asOf && entry.occurred_on <= asOf) continue;
    const list = byAccount.get(entry.account_id) ?? [];
    list.push({ direction: entry.direction, amountPaise: entry.amount_paise });
    byAccount.set(entry.account_id, list);
  }
  const centerNames = new Map((centers ?? []).map((c) => [c.id, c.name]));

  return accounts.map((account) => {
    const own = byAccount.get(account.id) ?? [];
    const balancePaise = accountBalance(account.opening_balance_paise, own);
    return {
      ...account,
      centerName: centerNames.get(account.center_id) ?? null,
      balancePaise,
      entryCount: own.length,
      needsTopUp: account.type === "petty_cash" && isPettyCashLow(balancePaise, account.float_paise),
    };
  });
}

export interface LedgerFilter {
  accountId?: string;
  centerId?: string;
  kind?: FinanceKind;
  /** Inclusive `YYYY-MM-DD`. */
  from?: string;
  to?: string;
  /** Only entries dated after this day (exclusive) — an account's opening date. */
  after?: string;
  /** Newest first, so `limit` keeps the latest rows rather than the oldest. */
  newest?: boolean;
  limit?: number;
}

/**
 * Ledger rows, oldest first — the order a running balance needs.
 *
 * Fetched a page at a time. PostgREST answers at most `max_rows` (1,000 on a
 * default Supabase project) however large a `.limit()` is asked for, and a
 * silent cut-off is the worst failure a report can have: the totals still
 * add up, to the wrong number. A year of imported bank lines passes 1,000
 * well inside the year, so every report that sums a period depends on this
 * walking the whole set. `limit` is a ceiling on rows returned, for screens
 * that only show the latest few hundred.
 */
export async function getLedgerEntries(
  supabase: SupabaseClient,
  filter: LedgerFilter = {},
): Promise<LedgerRow[]> {
  const ceiling = filter.limit ?? 100_000;
  const rows: LedgerRow[] = [];

  while (rows.length < ceiling) {
    let query = supabase.from("finance_transactions").select(LEDGER_COLUMNS);

    if (filter.accountId) query = query.eq("account_id", filter.accountId);
    if (filter.centerId) query = query.eq("center_id", filter.centerId);
    if (filter.kind) query = query.eq("kind", filter.kind);
    if (filter.after) query = query.gt("occurred_on", filter.after);
    if (filter.from) query = query.gte("occurred_on", filter.from);
    if (filter.to) query = query.lte("occurred_on", filter.to);

    const { data } = await query
      // `created_at` breaks the tie so two entries on the same day keep the
      // order they were recorded in — otherwise a running balance shuffles
      // between page loads. `txn_no` makes the order total, which paging
      // needs: with ties, a row could be skipped or repeated at a page edge.
      .order("occurred_on", { ascending: !filter.newest })
      .order("created_at", { ascending: !filter.newest })
      .order("txn_no", { ascending: !filter.newest })
      .range(rows.length, rows.length + PAGE_ROWS - 1)
      .returns<LedgerRow[]>();

    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_ROWS) break;
  }

  return rows.slice(0, ceiling);
}

const PAGE_ROWS = 1000;

/** Newest first, for the "what happened lately" list. */
export async function getRecentEntries(
  supabase: SupabaseClient,
  filter: LedgerFilter = {},
): Promise<LedgerRow[]> {
  const rows = await getLedgerEntries(supabase, filter);
  return rows.slice().reverse();
}

/**
 * The ids of entries that have been reversed, so a list can strike them
 * through. Derived by asking which rows are pointed AT — there is no
 * status column to read, by design.
 */
export function reversedIds(rows: LedgerRow[]): Set<string> {
  const reversed = new Set<string>();
  for (const row of rows) {
    if (row.reverses_transaction_id) reversed.add(row.reverses_transaction_id);
  }
  return reversed;
}

/** The expense and other-income heads an admin maintains in Settings → Dropdowns. */
export async function getFinanceCategories(
  supabase: SupabaseClient,
): Promise<{ expense: Array<{ value: string; label: string }>; income: Array<{ value: string; label: string }> }> {
  const { data } = await supabase
    .from("dropdown_options")
    .select("category, value, label")
    .in("category", ["finance_expense_category", "finance_income_category"])
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("sort_order")
    .returns<Array<{ category: string; value: string; label: string }>>();

  const rows = data ?? [];
  return {
    expense: rows.filter((r) => r.category === "finance_expense_category"),
    income: rows.filter((r) => r.category === "finance_income_category"),
  };
}

export interface OrgFinanceConfig {
  gstRate: number;
  fiscalYearStartMonth: number;
  currency: string;
}

export async function getFinanceConfig(supabase: SupabaseClient): Promise<OrgFinanceConfig> {
  const { data } = await supabase
    .from("org_settings")
    .select("gst_rate, fiscal_year_start_month, currency")
    .maybeSingle<{ gst_rate: string | null; fiscal_year_start_month: number; currency: string }>();

  return {
    // `numeric` comes back as a string from postgres-js and PostgREST
    // alike, precisely so nobody silently loses precision. Parse it here,
    // once, rather than in every caller.
    gstRate: Number(data?.gst_rate ?? 0.18),
    fiscalYearStartMonth: data?.fiscal_year_start_month ?? 4,
    currency: data?.currency ?? "INR",
  };
}

/**
 * Which admission each fee payment belongs to, for the ledger's Reverse button.
 *
 * A fee entry's reversal goes through the payment, and the payment's reversal is
 * scoped to its admission. Read through the caller's own client, so a payment
 * they may not see simply has no entry here and no button.
 */
export async function enrolmentIdsForPayments(
  supabase: SupabaseClient,
  paymentIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(paymentIds)];
  if (unique.length === 0) return new Map();
  const { data } = await supabase
    .from("payments")
    .select("id, enrolment_id")
    .in("id", unique)
    .returns<Array<{ id: string; enrolment_id: string }>>();
  return new Map((data ?? []).map((row) => [row.id, row.enrolment_id]));
}
