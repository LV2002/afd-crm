import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { INDIAN_STATES_DISTRICTS } from "@/lib/geo/indian-states-districts";

import type { FieldSchemaEntry } from "./get-field-schema";

export interface FieldOption {
  value: string;
  label: string;
}

/** Field types whose raw stored value is an id/code that needs resolving to a human label. */
export const OPTION_BEARING_TYPES = new Set(["select", "multiselect", "user_ref"]);

/**
 * Core select/multiselect fields that are backed by a real relationship
 * (a dropdown category, or another table) rather than the field
 * definition's own freeform `options`. `field_definitions.options` only
 * applies to genuinely custom fields — a core field's options come from
 * wherever its real column actually gets its values from, same principle
 * as CLAUDE.md's "core fields ... not delete[able]" but for option lists.
 */
const CORE_KEY_TO_DROPDOWN_CATEGORY: Record<string, string> = {
  education_status: "education_status",
  preferred_mode: "preferred_mode",
  lead_source: "lead_source",
  temperature: "temperature",
  interested_exams: "exam",
  courses_interested: "course",
};

/**
 * Resolves the option list for one select/multiselect field. Not part of
 * getFieldSchema() itself — only the filter bar and a future lead form
 * need live option lists; the list/export just need the schema's shape.
 *
 * `district` isn't resolved here: full state->district cascade is a lead
 * *form* concern (Session 7's create/edit form), not a list filter one —
 * see docs/DECISIONS.md. The state list itself is used for the `state`
 * filter today since it's a flat list.
 */
export async function resolveFieldOptions(
  supabase: SupabaseClient,
  field: FieldSchemaEntry,
): Promise<FieldOption[]> {
  if (field.key === "state") {
    return INDIAN_STATES_DISTRICTS.map((s) => ({ value: s.state, label: s.state }));
  }

  if (field.key === "district") {
    // Flattened, not state-scoped: the full state->district cascade is a
    // lead *form* concern (see the module comment) — this just needs to be
    // a usable filter today, not the cascading picker.
    const all = INDIAN_STATES_DISTRICTS.flatMap((s) => s.districts);
    const unique = Array.from(new Set(all)).sort((a, b) => a.localeCompare(b));
    return unique.map((d) => ({ value: d, label: d }));
  }

  if (field.key === "stage_id") {
    const { data } = await supabase
      .from("pipeline_stages")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order")
      .returns<Array<{ id: string; name: string }>>();
    return (data ?? []).map((r) => ({ value: r.id, label: r.name }));
  }

  if (field.key === "center_id") {
    const { data } = await supabase
      .from("centers")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .returns<Array<{ id: string; name: string }>>();
    return (data ?? []).map((r) => ({ value: r.id, label: r.name }));
  }

  if (field.type === "user_ref") {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("is_active", true)
      .order("full_name")
      .returns<Array<{ id: string; full_name: string }>>();
    return (data ?? []).map((r) => ({ value: r.id, label: r.full_name }));
  }

  const category = CORE_KEY_TO_DROPDOWN_CATEGORY[field.key];
  if (category) {
    const { data } = await supabase
      .from("dropdown_options")
      .select("value, label")
      .eq("category", category)
      .eq("is_active", true)
      .order("sort_order")
      .returns<FieldOption[]>();
    return data ?? [];
  }

  // A genuinely custom field: its own freeform options.
  return field.rawOptions ?? [];
}
