import "server-only";

import { createClient } from "@/lib/supabase/server";

import { DEFAULT_TERMINOLOGY, TERMINOLOGY_KEYS, type TerminologyKey, type TerminologyMap } from "./terms";

/**
 * Fetches the terminology table and merges it over the defaults. Missing or
 * inactive rows fall back to the built-in label rather than showing blank
 * text — a broken terminology screen should never take down every other
 * page's labels.
 */
export async function getTerminologyMap(): Promise<TerminologyMap> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("terminology")
    .select("key, singular, plural, is_active")
    .returns<Array<{ key: string; singular: string; plural: string; is_active: boolean }>>();

  const map: TerminologyMap = { ...DEFAULT_TERMINOLOGY };

  for (const row of data ?? []) {
    if (row.is_active && (TERMINOLOGY_KEYS as readonly string[]).includes(row.key)) {
      map[row.key as TerminologyKey] = { singular: row.singular, plural: row.plural };
    }
  }

  return map;
}
