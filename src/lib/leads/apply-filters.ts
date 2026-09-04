import { fieldFilterExpression } from "@/lib/fields/field-column";
import type { FieldSchemaEntry } from "@/lib/fields/get-field-schema";

export type LeadFilterValues = Record<string, string>;

/** URL search params use this prefix for per-field filters, so `search`/`page`/etc. don't collide with a field key. */
export const FILTER_PARAM_PREFIX = "f_";

export function filterParamKey(field: Pick<FieldSchemaEntry, "key">): string {
  return `${FILTER_PARAM_PREFIX}${field.key}`;
}

/** Reads this request's filter values (one per filterable field) out of the URL search params. */
export function readFilterValues(
  searchParams: Record<string, string | string[] | undefined>,
  filterableFields: Array<Pick<FieldSchemaEntry, "key">>,
): LeadFilterValues {
  const values: LeadFilterValues = {};
  for (const field of filterableFields) {
    const raw = searchParams[filterParamKey(field)];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) values[field.key] = value;
  }
  return values;
}

/**
 * Applies this request's active filters to a `leads` query. The operator
 * is chosen by field *type*, not by field key, so a newly-added custom
 * field filters correctly with no code change — the same "one schema
 * source" principle as getFieldSchema() itself.
 *
 * This narrows results for the caller's convenience; it is never the
 * security boundary. RLS on `leads` (migration 0005) enforces the
 * own/center/all scope regardless of what filters are or aren't applied
 * here — CLAUDE.md non-negotiable #3.
 */
interface FilterableQuery {
  eq(column: string, value: unknown): this;
  ilike(column: string, value: string): this;
  contains(column: string, value: unknown): this;
}

export function applyLeadFilters<Q extends FilterableQuery>(
  query: Q,
  filterableFields: FieldSchemaEntry[],
  values: LeadFilterValues,
): Q {
  let next = query;
  for (const field of filterableFields) {
    const value = values[field.key];
    if (!value) continue;

    if (field.type === "multiselect") {
      // A core field's array lives in a real text[] column (Postgres array
      // containment); a custom field's array lives inside the `custom`
      // jsonb blob, where containment is checked against the whole column
      // with a matching nested shape instead.
      next = field.isCore
        ? next.contains(fieldFilterExpression(field), [value])
        : next.contains("custom", { [field.key]: [value] });
    } else if (field.type === "select" || field.type === "user_ref") {
      next = next.eq(fieldFilterExpression(field), value);
    } else {
      next = next.ilike(fieldFilterExpression(field), `%${value}%`);
    }
  }
  return next;
}
