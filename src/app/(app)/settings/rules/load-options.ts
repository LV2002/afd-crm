import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ConditionField } from "@/lib/assignment/evaluate-conditions";
import { getDropdownOptions } from "@/lib/fields/resolve-field-options";
import { INDIAN_STATES_DISTRICTS } from "@/lib/geo/indian-states-districts";
import { CONDITION_FIELDS, CONDITION_FIELD_KEYS } from "@/lib/rules/condition-fields";

/**
 * Everything the rule builder needs to show words instead of ids.
 *
 * Driven by each field's declared `optionSource`, so adding a field to
 * `condition-fields.ts` with `optionSource: "dropdown:lost_reason"` makes
 * it selectable here with no change to this file — and an admin adding a
 * new lead source in Settings → Dropdowns gets it in the rule builder on
 * the next page load, which is the whole point of CLAUDE.md § 10.
 */

export interface RuleOptions {
  users: Array<{ value: string; label: string; hint?: string }>;
  centers: Array<{ value: string; label: string }>;
  optionsByField: Record<string, Array<{ value: string; label: string }>>;
  fields: ConditionField[];
}

export async function loadRuleOptions(supabase: SupabaseClient): Promise<RuleOptions> {
  const [{ data: centerRows }, { data: userRows }] = await Promise.all([
    supabase
      .from("centers")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .returns<Array<{ id: string; name: string }>>(),
    // Anybody active can own a lead — a centre head takes the overflow,
    // and which roles do sales is an admin's decision, not this file's.
    supabase
      .from("profiles")
      .select("id, full_name, roles(name)")
      .eq("is_active", true)
      .order("full_name")
      .returns<Array<{ id: string; full_name: string; roles: { name: string } | null }>>(),
  ]);

  const centers = (centerRows ?? []).map((row) => ({ value: row.id, label: row.name }));

  const optionsByField: Record<string, Array<{ value: string; label: string }>> = {};
  const states = INDIAN_STATES_DISTRICTS.map((entry) => ({ value: entry.state, label: entry.state }));
  const districts = [...new Set(INDIAN_STATES_DISTRICTS.flatMap((entry) => entry.districts))]
    .sort((a, b) => a.localeCompare(b))
    .map((district) => ({ value: district, label: district }));

  await Promise.all(
    CONDITION_FIELD_KEYS.map(async (field) => {
      const source = CONDITION_FIELDS[field].optionSource;
      if (!source) return;
      if (source === "centers") optionsByField[field] = centers;
      else if (source === "states") optionsByField[field] = states;
      else if (source === "districts") optionsByField[field] = districts;
      else optionsByField[field] = await getDropdownOptions(supabase, source.slice("dropdown:".length));
    }),
  );

  return {
    users: (userRows ?? []).map((row) => ({
      value: row.id,
      label: row.full_name,
      hint: row.roles?.name,
    })),
    centers,
    optionsByField,
    fields: CONDITION_FIELD_KEYS,
  };
}
