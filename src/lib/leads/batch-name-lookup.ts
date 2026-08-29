import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Resolves a handful of ids on a `name`-shaped table (centers.name, profiles.full_name) into a lookup map, skipping the round-trip entirely when there's nothing to look up. */
export async function batchNameLookup(
  supabase: SupabaseClient,
  table: "centers" | "profiles",
  nameColumn: "name" | "full_name",
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  const { data } = await supabase
    .from(table)
    .select(`id, ${nameColumn}`)
    .in("id", ids)
    .returns<Array<{ id: string } & Record<string, string>>>();

  for (const row of data ?? []) {
    map.set(row.id, row[nameColumn]);
  }
  return map;
}
