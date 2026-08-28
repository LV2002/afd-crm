import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SessionUser } from "@/lib/auth/session";

export const FIELD_ENTITIES = ["lead", "student", "enrolment"] as const;
export type FieldEntity = (typeof FIELD_ENTITIES)[number];

export const FIELD_TYPES = [
  "text",
  "long_text",
  "number",
  "currency",
  "date",
  "datetime",
  "boolean",
  "select",
  "multiselect",
  "phone",
  "email",
  "url",
  "file",
  "user_ref",
  "lead_ref",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface FieldSchemaEntry {
  id: string;
  key: string;
  label: string;
  helpText: string | null;
  type: FieldType;
  /** The field definition's own freeform options (custom select/multiselect fields only — core fields resolve their options elsewhere, see resolve-field-options.ts). */
  rawOptions: Array<{ value: string; label: string }> | null;
  isCore: boolean;
  isRequired: boolean;
  section: string;
  sortOrder: number;
  showInList: boolean;
  showInFilters: boolean;
  /** True if the calling user's role may edit this field's value (used by a future lead form). */
  isEditable: boolean;
}

interface FieldDefinitionRow {
  id: string;
  key: string;
  label: string;
  help_text: string | null;
  type: FieldType;
  options: Array<{ value: string; label: string }> | null;
  is_required: boolean;
  section: string;
  sort_order: number;
  show_in_list: boolean;
  show_in_filters: boolean;
  is_core: boolean;
  visible_to_roles: string[] | null;
  editable_by_roles: string[] | null;
}

/**
 * The one schema source for a given entity (docs/02-BUILD-PHASES.md § Phase 1,
 * docs/01-DATA-MODEL.md § Custom fields): the lead form, the list columns,
 * the filter bar and the export all read `field_definitions` through this,
 * so adding a field in Settings requires no code change anywhere else.
 *
 * Filters out inactive fields and fields the caller's role can't see
 * (`visible_to_roles` null means visible to everyone). `is_active` and
 * role-visibility are enforced here rather than left to the caller because
 * every consumer (form, list, filters, export) needs the same answer —
 * one place to get it right instead of four.
 */
export async function getFieldSchema(
  supabase: SupabaseClient,
  entity: FieldEntity,
  user: SessionUser,
): Promise<FieldSchemaEntry[]> {
  const { data, error } = await supabase
    .from("field_definitions")
    .select(
      "id, key, label, help_text, type, options, is_required, section, sort_order, show_in_list, show_in_filters, is_core, visible_to_roles, editable_by_roles",
    )
    .eq("entity", entity)
    .eq("is_active", true)
    .order("sort_order")
    .returns<FieldDefinitionRow[]>();

  if (error) {
    throw new Error(`getFieldSchema(${entity}): ${error.message}`);
  }

  return (data ?? [])
    .filter((row) => row.visible_to_roles === null || row.visible_to_roles.includes(user.roleId))
    .map((row) => ({
      id: row.id,
      key: row.key,
      label: row.label,
      helpText: row.help_text,
      type: row.type,
      rawOptions: row.options,
      isCore: row.is_core,
      isRequired: row.is_required,
      section: row.section,
      sortOrder: row.sort_order,
      showInList: row.show_in_list,
      showInFilters: row.show_in_filters,
      isEditable: row.editable_by_roles === null || row.editable_by_roles.includes(user.roleId),
    }));
}
