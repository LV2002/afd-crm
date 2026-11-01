import type { SupabaseClient } from "@supabase/supabase-js";

export interface BankAccountOption {
  id: string;
  name: string;
  centerId: string;
}

/** Active bank accounts the caller can see (RLS decides which). */
export async function getBankAccounts(
  supabase: SupabaseClient,
  centerId?: string,
): Promise<BankAccountOption[]> {
  let query = supabase
    .from("finance_accounts")
    .select("id, name, center_id")
    .eq("type", "bank")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("name");
  if (centerId) query = query.eq("center_id", centerId);
  const { data } = await query;
  return (data ?? []).map((a) => ({ id: a.id, name: a.name, centerId: a.center_id }));
}

export interface PendingLine {
  id: string;
  accountId: string;
  occurredOn: string;
  particulars: string;
  direction: "in" | "out";
  amountPaise: number;
  note: string | null;
  dateGuessed: boolean;
}

export interface PendingFilter {
  accountId?: string;
  centerId?: string;
  direction?: "in" | "out";
  q?: string;
  limit: number;
  offset: number;
}

export async function getPendingLines(
  supabase: SupabaseClient,
  filter: PendingFilter,
): Promise<{ lines: PendingLine[]; total: number }> {
  let query = supabase
    .from("bank_statement_lines")
    .select("id, account_id, occurred_on, particulars, direction, amount_paise, note, date_guessed", {
      count: "exact",
    })
    .eq("status", "pending")
    .order("occurred_on", { ascending: false })
    .order("imported_at", { ascending: false })
    .range(filter.offset, filter.offset + filter.limit - 1);

  if (filter.accountId) query = query.eq("account_id", filter.accountId);
  if (filter.centerId) query = query.eq("center_id", filter.centerId);
  if (filter.direction) query = query.eq("direction", filter.direction);
  if (filter.q) {
    // Strip characters that mean something inside a PostgREST filter list.
    const term = filter.q.replace(/[,()%*\\]/g, " ").trim();
    if (term) query = query.or(`particulars.ilike.%${term}%,note.ilike.%${term}%`);
  }

  const { data, count } = await query;
  return {
    total: count ?? 0,
    lines: (data ?? []).map((r) => ({
      id: r.id,
      accountId: r.account_id,
      occurredOn: r.occurred_on,
      particulars: r.particulars,
      direction: r.direction as "in" | "out",
      amountPaise: Number(r.amount_paise),
      note: r.note,
      dateGuessed: r.date_guessed,
    })),
  };
}

/** How many lines still wait, per direction — the badge on the tab. */
export async function countPendingLines(supabase: SupabaseClient): Promise<number> {
  const { count } = await supabase
    .from("bank_statement_lines")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}
