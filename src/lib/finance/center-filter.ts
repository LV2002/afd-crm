import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export const FINANCE_CENTER_COOKIE = "finance_center";

export interface FinanceCenter {
  id: string;
  name: string;
}

/**
 * The centres that have a finance account the caller can see. RLS decides:
 * a centre head gets their own centre, accounts and admins get them all.
 */
export async function getFinanceCenters(supabase: SupabaseClient): Promise<FinanceCenter[]> {
  const { data: accounts } = await supabase
    .from("finance_accounts")
    .select("center_id")
    .is("deleted_at", null);
  const ids = [...new Set((accounts ?? []).map((a) => a.center_id as string))];
  if (ids.length === 0) return [];

  const { data: centers } = await supabase
    .from("centers")
    .select("id, name")
    .in("id", ids)
    .order("name");
  return (centers ?? []).map((c) => ({ id: c.id as string, name: c.name as string }));
}

/**
 * The centre the person chose to look at, or undefined for the whole company.
 *
 * It is a cookie rather than a URL parameter so every finance tab, month
 * picker and year arrow honours it without each one having to carry it. A
 * stale value (a centre since removed, or one this person can't see) falls
 * back to "all" rather than showing an empty page.
 */
export async function getFinanceCenterId(supabase: SupabaseClient): Promise<string | undefined> {
  const chosen = (await cookies()).get(FINANCE_CENTER_COOKIE)?.value;
  if (!chosen) return undefined;
  const centers = await getFinanceCenters(supabase);
  return centers.some((c) => c.id === chosen) ? chosen : undefined;
}
