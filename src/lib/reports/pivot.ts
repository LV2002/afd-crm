import type { FieldSchemaEntry, FieldType } from "@/lib/fields/get-field-schema";

/**
 * The generic pivot the Insights page is built on: filter the lead set by
 * any number of lead variables, then count it by any one of them.
 *
 * This replaces four hardcoded reports (by source, counsellor scorecard,
 * centre performance, funnel-only) with one grammar. "Leads by source"
 * is now group-by = Lead Source with no filters; "how did Kochi's Meta
 * leads do this quarter" is the same machinery with two filters and a
 * date range, and needs no new code. docs/02-BUILD-PHASES.md § Phase 2
 * called for a "generic pivot widget"; this is it.
 *
 * Pure functions over already-fetched, already-scoped rows — the page
 * does the fetching and the RLS-equivalent scoping, exactly as
 * aggregate-leads.ts does, so all of this is testable without a database.
 */

export type PivotField = Pick<FieldSchemaEntry, "key" | "label" | "type" | "isCore">;

/**
 * Field types that can never be a dimension.
 *
 * The Insights page reads over the direct Postgres connection rather than
 * through RLS (see the page's own comment for why), so the guarantee that
 * it never exposes an individual lead's PII has to come from what it is
 * *able* to select. Phone, email, URL and file are identifying or
 * near-identifying; long text is somebody's notes; currency and lead_ref
 * are continuous or opaque and make meaningless groups.
 */
const NON_DIMENSION_TYPES = new Set<FieldType>([
  "phone",
  "email",
  "url",
  "file",
  "long_text",
  "currency",
  "lead_ref",
]);

/**
 * Free-text fields that name a person or their doorstep. A group label is
 * an aggregate — "Kochi, 42 leads" tells you nothing about anybody — but
 * "Anjali Menon, 1 lead" is just the lead, spelled differently. These are
 * the lead fields where the value *is* the person, so they are never a
 * dimension however they are typed.
 */
const IDENTIFYING_KEYS = new Set(["student_name", "father_name", "mother_name", "address_line"]);

/** Reserved filter value meaning "rows where this variable is empty" — an answer in its own right. */
export const NOT_SET = "__not_set__";
export const NOT_SET_LABEL = "Not set";

/** True if this lead field can be filtered on and grouped by. */
export function isDimension(field: PivotField): boolean {
  return !NON_DIMENSION_TYPES.has(field.type) && !IDENTIFYING_KEYS.has(field.key);
}

export function dimensionFields(fields: PivotField[]): PivotField[] {
  return fields.filter(isDimension);
}

/**
 * One lead, reduced to the dimension values the page asked for. `stageId`
 * is separate because won/lost is derived from the stage's *type*, not
 * from the stage as a dimension.
 */
export interface PivotLead {
  id: string;
  stageId: string | null;
  /** Keyed by field key — a core field's column value, or the value out of `custom`. */
  values: Record<string, unknown>;
}

/**
 * The bucket(s) one lead falls into for one variable.
 *
 * Everything downstream — filtering, grouping, the option labels — runs
 * on these, so a filter always matches exactly what the group-by would
 * have shown. A multiselect lead lands in several buckets at once
 * (a lead interested in NID and NIFT counts under both), which is the
 * honest reading of "leads by exam"; it does mean such a breakdown's
 * column sums to more than the lead count, and the page says so.
 *
 * An empty array means "not set", kept distinct from the string "" so a
 * blank is never silently grouped with a real answer.
 */
export function bucketsFor(field: PivotField, raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];

  if (Array.isArray(raw)) {
    return raw.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0);
  }

  if (typeof raw === "boolean") return [raw ? "true" : "false"];

  if (field.type === "date" || field.type === "datetime") {
    // Months, not days: a per-day breakdown of ~200 leads a month is a
    // list, not a report. The bucket is the same YYYY-MM string a filter
    // is compared against, so the two can't drift apart.
    const iso = raw instanceof Date ? raw.toISOString() : String(raw);
    const month = iso.slice(0, 7);
    return /^\d{4}-\d{2}$/.test(month) ? [month] : [];
  }

  const value = String(raw).trim();
  return value.length === 0 ? [] : [value];
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * A bucket as a human reads it. `optionLabels` comes from
 * resolveFieldOptions() on the server, so a stage id or a counsellor's
 * uuid shows as its name; anything unresolved falls back to the raw
 * value rather than to a blank.
 */
export function bucketLabel(
  field: PivotField,
  bucket: string,
  optionLabels: ReadonlyMap<string, string>,
): string {
  if (bucket === NOT_SET) return NOT_SET_LABEL;
  if (field.type === "boolean") return bucket === "true" ? "Yes" : "No";
  if (field.type === "date" || field.type === "datetime") {
    const [year, month] = bucket.split("-");
    const index = Number(month) - 1;
    if (MONTH_NAMES[index]) return `${MONTH_NAMES[index]} ${year}`;
    return bucket;
  }
  return optionLabels.get(bucket) ?? bucket;
}

/** One variable's active filter. An empty string means "no filter on this variable". */
export type PivotFilters = Record<string, string>;

/**
 * Does this lead pass this one filter? Compared against the same buckets
 * the group-by uses, with one exception: free text matches on a substring,
 * because typing part of a school's name and getting nothing is not a
 * filter anybody wants.
 */
export function matchesFilter(field: PivotField, raw: unknown, filterValue: string): boolean {
  const wanted = filterValue.trim();
  if (wanted.length === 0) return true;

  const buckets = bucketsFor(field, raw);
  if (wanted === NOT_SET) return buckets.length === 0;

  if (field.type === "text") {
    const needle = wanted.toLowerCase();
    return buckets.some((bucket) => bucket.toLowerCase().includes(needle));
  }

  return buckets.includes(wanted);
}

/** Every filter must pass — the filter row reads as "and", the way a spreadsheet's does. */
export function applyPivotFilters(
  leads: PivotLead[],
  fields: PivotField[],
  filters: PivotFilters,
): PivotLead[] {
  const active = fields.filter((field) => (filters[field.key] ?? "").trim().length > 0);
  if (active.length === 0) return leads;

  return leads.filter((lead) =>
    active.every((field) => matchesFilter(field, lead.values[field.key], filters[field.key])),
  );
}

export interface PivotRow {
  /** The raw bucket, or NOT_SET. Stable across renames; the label is what's displayed. */
  bucket: string;
  label: string;
  total: number;
  won: number;
  lost: number;
}

export interface PivotTotals {
  total: number;
  won: number;
  lost: number;
}

export function summarise(
  leads: PivotLead[],
  stageTypeById: ReadonlyMap<string, string>,
): PivotTotals {
  let won = 0;
  let lost = 0;
  for (const lead of leads) {
    const stageType = lead.stageId ? stageTypeById.get(lead.stageId) : undefined;
    if (stageType === "won") won += 1;
    if (stageType === "lost") lost += 1;
  }
  return { total: leads.length, won, lost };
}

/**
 * The breakdown itself. Sorted by size, biggest first, with "Not set"
 * always last however big it is — it is a gap in the data rather than a
 * category, and leaving it at the top of the table buries the answer.
 */
export function groupLeads(
  leads: PivotLead[],
  field: PivotField,
  stageTypeById: ReadonlyMap<string, string>,
  optionLabels: ReadonlyMap<string, string>,
): PivotRow[] {
  const rows = new Map<string, PivotRow>();

  for (const lead of leads) {
    const buckets = bucketsFor(field, lead.values[field.key]);
    const keys = buckets.length === 0 ? [NOT_SET] : buckets;
    const stageType = lead.stageId ? stageTypeById.get(lead.stageId) : undefined;

    for (const bucket of keys) {
      const row = rows.get(bucket) ?? {
        bucket,
        label: bucketLabel(field, bucket, optionLabels),
        total: 0,
        won: 0,
        lost: 0,
      };
      row.total += 1;
      if (stageType === "won") row.won += 1;
      if (stageType === "lost") row.lost += 1;
      rows.set(bucket, row);
    }
  }

  return Array.from(rows.values()).sort((a, b) => {
    if (a.bucket === NOT_SET) return 1;
    if (b.bucket === NOT_SET) return -1;
    if (b.total !== a.total) return b.total - a.total;
    return a.label.localeCompare(b.label);
  });
}

/** A lead counts under every value it holds, so a multiselect breakdown legitimately sums past the lead count. */
export function oversubscribed(rows: PivotRow[], leadCount: number): boolean {
  return rows.reduce((sum, row) => sum + row.total, 0) > leadCount;
}
