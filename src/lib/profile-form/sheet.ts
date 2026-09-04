import type { FieldType } from "@/lib/fields/get-field-schema";
import type { FieldOption } from "@/lib/fields/resolve-field-options";

/**
 * The submitted profile forms as a spreadsheet: pick which of the
 * student's answers become columns, then search, sort and filter on them.
 *
 * The questions are configuration (field_definitions, entity 'student'),
 * so the columns have to be too — nothing here names a question. Which
 * columns are shown by default comes from the same "Show in list" tick an
 * admin already has in Settings → Custom Fields.
 */

export interface SheetColumn {
  key: string;
  label: string;
  type: FieldType;
  /** Empty for a free-text answer, which gets a search box instead of a dropdown. */
  options: FieldOption[];
}

/**
 * Answer types that are never a column.
 *
 * Phones and emails because a sheet of them is exactly the bulk contact
 * export CLAUDE.md non-negotiable #6 exists to prevent — they still show
 * on the expanded row, masked unless the viewer may reveal them. Long
 * text, files and URLs because a paragraph or a link makes a useless
 * column; they are on the expanded row too.
 */
export const NON_COLUMN_TYPES = new Set<FieldType>([
  "phone",
  "email",
  "url",
  "file",
  "long_text",
]);

export function isSheetColumn(field: { type: FieldType }): boolean {
  return !NON_COLUMN_TYPES.has(field.type);
}

/** True when the student left this question blank — sorted last, and filterable as "Not answered". */
export function isBlank(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  if (Array.isArray(raw)) return raw.filter((v) => String(v).trim().length > 0).length === 0;
  return String(raw).trim().length === 0;
}

/**
 * One answer as it reads on screen. Option-backed answers resolve to
 * their label — a batch is stored as a uuid and nobody sorts by uuid.
 */
export function answerText(column: SheetColumn, raw: unknown): string {
  if (isBlank(raw)) return "";

  const labelFor = (value: string): string =>
    column.options.find((option) => option.value === value)?.label ?? value;

  if (Array.isArray(raw)) {
    return raw
      .map((entry) => String(entry).trim())
      .filter((entry) => entry.length > 0)
      .map(labelFor)
      .join(", ");
  }

  if (typeof raw === "boolean") return raw ? "Yes" : "No";

  return labelFor(String(raw).trim());
}

/** Reserved filter value for "this question wasn't answered". */
export const UNANSWERED = "__unanswered__";
export const UNANSWERED_LABEL = "Not answered";

/**
 * A dropdown answer matches exactly; anything else matches on a
 * substring, because half a school's name is how people search.
 */
export function matchesColumnFilter(column: SheetColumn, raw: unknown, filter: string): boolean {
  const wanted = filter.trim();
  if (wanted.length === 0) return true;
  if (wanted === UNANSWERED) return isBlank(raw);
  if (isBlank(raw)) return false;

  if (column.options.length > 0) {
    const values = Array.isArray(raw) ? raw.map((v) => String(v).trim()) : [String(raw).trim()];
    return values.includes(wanted);
  }

  return answerText(column, raw).toLowerCase().includes(wanted.toLowerCase());
}

/**
 * Orders two answers for one column. Unanswered always sinks to the
 * bottom in both directions — a blank is not "smallest", it's missing,
 * and flipping the sort to hunt for it is nobody's intent.
 */
export function compareAnswers(
  column: SheetColumn,
  a: unknown,
  b: unknown,
  ascending: boolean,
): number {
  const aBlank = isBlank(a);
  const bBlank = isBlank(b);
  if (aBlank && bBlank) return 0;
  if (aBlank) return 1;
  if (bBlank) return -1;

  const direction = ascending ? 1 : -1;

  if (column.type === "number") {
    const an = Number(a);
    const bn = Number(b);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return (an - bn) * direction;
  }

  if (column.type === "date" || column.type === "datetime") {
    const at = new Date(String(a)).getTime();
    const bt = new Date(String(b)).getTime();
    if (!Number.isNaN(at) && !Number.isNaN(bt)) return (at - bt) * direction;
  }

  // Everything else compares on what is displayed, so the order on screen
  // matches the order the reader can see — a batch sorts by its name, not
  // by the uuid behind it.
  return answerText(column, a).localeCompare(answerText(column, b)) * direction;
}

/**
 * Which columns a sheet opens with: whatever an admin ticked "Show in
 * list" for, and failing that the first few questions on the form, so the
 * table is never a single unhelpful Student column.
 */
export function defaultColumnKeys(
  columns: Array<SheetColumn & { showInList: boolean }>,
  fallbackCount = 4,
): string[] {
  const ticked = columns.filter((column) => column.showInList).map((column) => column.key);
  if (ticked.length > 0) return ticked;
  return columns.slice(0, fallbackCount).map((column) => column.key);
}
