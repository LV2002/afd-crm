import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { CORE_KEY_TO_DROPDOWN_CATEGORY } from "@/lib/fields/core-dropdown-categories";
import { INDIAN_STATES_DISTRICTS } from "@/lib/geo/indian-states-districts";

import type { FieldSchemaEntry } from "./get-field-schema";

/**
 * What a stage looks like before an admin has picked anything.
 *
 * `pipeline_stages.color` has been editable since Settings → Pipeline
 * existed, and in practice nobody fills in fourteen colour pickers — so
 * every stage rendered the same grey pill and the colour support may as
 * well not have been there. Leon asked for the won stage to be green,
 * which is really this: a stage should arrive already looking like what
 * it means.
 *
 * Keyed on `stage_type` rather than name, so it still works after
 * "Admission Confirmed" is renamed, and in an instance for a different
 * company with different stages entirely — the type is the thing the
 * system actually reasons about.
 *
 * **An explicit colour always wins.** This is a default, not an override,
 * and the picker in Settings → Pipeline is still the answer for an
 * institute that wants its own.
 *
 * The eight ordinary stages deliberately get nothing. Colouring all
 * fourteen would make the list a rainbow in which nothing stands out,
 * and the ones worth spotting at a glance are the ends of the funnel:
 * won, lost, parked, and the two that mean money is in motion.
 */
const STAGE_TYPE_COLOUR: Record<string, string> = {
  new: "#2a78d6",
  scheduled: "#7b5ea7",
  enrolment_form: "#0e8f9e",
  payment: "#eda100",
  won: "#1f9d55",
  lost: "#d64545",
  parked: "#6b7280",
};

export interface FieldOption {
  value: string;
  label: string;
  /**
   * The colour an admin gave this option, as stored — a hex string, or
   * null where nobody set one.
   *
   * Carried through so a list can show a stage or a temperature as a
   * coloured dot rather than another line of grey text. It is the admin's
   * own choice from Settings, which is why it travels with the option
   * instead of being looked up again by whoever draws it.
   */
  color?: string | null;
}

/** Field types whose raw stored value is an id/code that needs resolving to a human label. */
export const OPTION_BEARING_TYPES = new Set(["select", "multiselect", "user_ref"]);


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
      .select("id, name, color, stage_type")
      .eq("is_active", true)
      .order("sort_order")
      .returns<Array<{ id: string; name: string; color: string | null; stage_type: string }>>();
    return (data ?? []).map((r) => ({
      value: r.id,
      label: r.name,
      color: r.color ?? STAGE_TYPE_COLOUR[r.stage_type] ?? null,
    }));
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

  if (field.key === "current_batch_id") {
    const { data } = await supabase
      .from("batches")
      .select("id, name")
      .order("name")
      .returns<Array<{ id: string; name: string }>>();
    return (data ?? []).map((r) => ({ value: r.id, label: r.name }));
  }

  if (field.type === "user_ref") {
    return getAssignableUsers(supabase);
  }

  const category = CORE_KEY_TO_DROPDOWN_CATEGORY[field.key];
  if (category) {
    return getDropdownOptions(supabase, category);
  }

  // A genuinely custom field: its own freeform options.
  return field.rawOptions ?? [];
}

/**
 * Users a lead can be assigned to: whoever holds `lead.read` at scope
 * `'own'` — the "works my own leads" shape, today only the counsellor role,
 * resolved dynamically through role_permissions rather than a hardcoded
 * role code/name (roles are admin-editable data, per CLAUDE.md).
 */
async function getAssignableUsers(supabase: SupabaseClient): Promise<FieldOption[]> {
  const { data: rolePerms } = await supabase
    .from("role_permissions")
    .select("role_id")
    .eq("permission_code", "lead.read")
    .eq("scope", "own")
    .returns<Array<{ role_id: string }>>();

  const roleIds = (rolePerms ?? []).map((r) => r.role_id);
  if (roleIds.length === 0) return [];

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("is_active", true)
    .in("role_id", roleIds)
    .order("full_name")
    .returns<Array<{ id: string; full_name: string }>>();
  return (data ?? []).map((r) => ({ value: r.id, label: r.full_name }));
}

/** A plain dropdown_options category lookup, for UI that isn't backed by a field_definitions row (e.g. the interaction-log form's Type/Outcome selects). */
export async function getDropdownOptions(supabase: SupabaseClient, category: string): Promise<FieldOption[]> {
  const { data } = await supabase
    .from("dropdown_options")
    .select("value, label, color")
    .eq("category", category)
    .eq("is_active", true)
    .order("sort_order")
    .returns<FieldOption[]>();
  return data ?? [];
}
