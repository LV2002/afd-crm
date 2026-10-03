import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { FieldSchemaEntry } from "./get-field-schema";
import type { FieldOption } from "./resolve-field-options";

/**
 * Names for the people actually referenced by the rows on screen.
 *
 * `resolveFieldOptions` answers a different question: who may a lead be
 * ASSIGNED to. That is deliberately narrow — whoever holds `lead.read` at
 * scope `own`, which today is counsellors — and it makes a fine picker.
 *
 * It makes a poor lookup table. A lead assigned to an admin, to a centre
 * head who carries their own leads, or to somebody who has since changed
 * role is not in that list, so the list view found no label and printed a
 * uuid at the counsellor who was supposed to be reading it.
 *
 * Who can be assigned and who HAS been assigned are different sets, and
 * conflating them is what produced `28d12296-8de1-4a52-8838-0a3ae0228c58`
 * in a column headed "Assigned Counsellor". So: look up exactly the ids
 * present, with no role filter, and add any the picker did not know
 * about.
 *
 * Inactive and former staff are included on purpose. "Assigned to
 * somebody who has left" is a real and important state; showing it as a
 * uuid hides it, and showing it as a name is how anybody notices.
 */
export async function mergeUserRefLabels(
  supabase: SupabaseClient,
  fields: FieldSchemaEntry[],
  rows: Array<Record<string, unknown>>,
  optionsByKey: Record<string, FieldOption[]>,
): Promise<Record<string, FieldOption[]>> {
  const userRefKeys = fields.filter((field) => field.type === "user_ref").map((f) => f.key);
  if (userRefKeys.length === 0 || rows.length === 0) return optionsByKey;

  const known = new Set(userRefKeys.flatMap((key) => (optionsByKey[key] ?? []).map((o) => o.value)));

  const missing = new Set<string>();
  for (const row of rows) {
    for (const key of userRefKeys) {
      const value = row[key];
      if (typeof value === "string" && value && !known.has(value)) missing.add(value);
    }
  }
  if (missing.size === 0) return optionsByKey;

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", Array.from(missing))
    .returns<Array<{ id: string; full_name: string | null }>>();

  const extra: FieldOption[] = (data ?? []).map((person) => ({
    value: person.id,
    // A profile with no name is still better identified by "Unnamed user"
    // than by its uuid.
    label: person.full_name || "Unnamed user",
  }));
  if (extra.length === 0) return optionsByKey;

  const merged = { ...optionsByKey };
  for (const key of userRefKeys) {
    merged[key] = [...(optionsByKey[key] ?? []), ...extra];
  }
  return merged;
}
