import type { FieldSchemaEntry } from "./get-field-schema";

/**
 * Two seeded core `lead` fields don't have a column of the same name:
 * `lead_source`/`sub_source` were seeded as field_definitions rows, but
 * `leads` only has `first_touch_source`/`last_touch_source` (and their
 * `_sub_source` counterparts) — there's no plain "source" column. This
 * mirrors the same call made for the assignment engine's rule conditions
 * (docs/DECISIONS.md, 2026-08-28 "source" entry): last-touch is the more
 * current attribution value, and the two are identical on a brand-new lead
 * anyway. Every other core field's key is already the real column name.
 */
const CORE_KEY_COLUMN_OVERRIDES: Record<string, string> = {
  lead_source: "last_touch_source",
  sub_source: "last_touch_sub_source",
};

/** The actual `leads` column a *core* field's value lives in. Not meaningful for a non-core field — see fieldFilterExpression/getRawFieldValue. */
export function fieldColumn(key: string): string {
  return CORE_KEY_COLUMN_OVERRIDES[key] ?? key;
}

/**
 * A non-core field (is_core: false, i.e. anything an admin adds through
 * Settings → Custom Fields) has no column of its own at all — its value
 * lives inside `leads.custom` jsonb, keyed by the field's `key`
 * (schema/leads.ts: "escape hatch for custom fields ... no migration
 * needed"). PostgREST/Supabase support filtering a jsonb path directly via
 * `custom->>key` as the "column" argument to eq/ilike/etc.
 */
export function fieldFilterExpression(field: Pick<FieldSchemaEntry, "key" | "isCore">): string {
  return field.isCore ? fieldColumn(field.key) : `custom->>${field.key}`;
}

/** Reads a field's value off a `leads` row already fetched via Supabase (core column, or the `custom` jsonb for a non-core field). */
export function getRawFieldValue(
  field: Pick<FieldSchemaEntry, "key" | "isCore">,
  row: Record<string, unknown>,
): unknown {
  if (field.isCore) return row[fieldColumn(field.key)];
  const custom = row.custom as Record<string, unknown> | null | undefined;
  return custom?.[field.key] ?? null;
}
