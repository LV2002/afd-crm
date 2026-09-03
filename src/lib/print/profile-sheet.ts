import { formatDateIST } from "@/lib/format/date";
import type { FieldSchemaEntry } from "@/lib/fields/get-field-schema";
import type { createClient } from "@/lib/supabase/server";

/**
 * The layout of AFD's paper student profile sheet, in one place.
 *
 * Two screens print this sheet — the student record
 * (/students/[id]/print) and a lead's submitted profile form
 * (/leads/[id]/profile-form/print) — and they must come off the printer
 * identical, because they are the same physical form filled in from
 * different sides. Keeping the row order in one module is what guarantees
 * that; when it lived inside the students page, the second screen could
 * only have copied it and started drifting the day either changed.
 */

/**
 * Label/value pairs, two per printed row, in the exact order of the
 * uploaded sheet. Labels are NOT here: they come from `field_definitions`
 * so renaming a question in Settings renames it on paper too. The
 * PAIRING and ORDER are fixed, because a paper form's layout is a
 * one-time design decision rather than admin-configurable data. Adding a
 * genuinely new question to the printed sheet means adding a row here.
 */
export const PRINT_ROWS: Array<[string, string | null]> = [
  ["program", "current_batch_id"],
  ["dob", "mode"],
  ["city", "address"],
  ["pincode", "state"],
  ["email", "phone"],
  ["mother_name", "mother_phone"],
  ["father_name", "father_phone"],
  ["current_qualification", "design_discipline_interested"],
  ["target_exams", "last_school_attended"],
  ["art_teacher_name", "art_teacher_phone"],
  ["stream_11_12", "exam_board"],
  ["percentage_12th", "percentage_10th"],
  ["hobbies", "joined_at"],
];

/** Boxed on the paper original, so boxed here. */
export const BADGE_KEYS = new Set(["program", "current_batch_id", "mode"]);

/** Every key the sheet can print, including the full-width comments row. */
export const PRINT_KEYS: string[] = [
  ...PRINT_ROWS.flatMap(([left, right]) => (right ? [left, right] : [left])),
  "comments",
];

export interface SheetCell {
  label: string;
  display: string;
}

export type SheetCells = Record<string, SheetCell>;

/**
 * Resolves the option lists for the select-ish fields on the sheet, so a
 * stored value like a batch uuid prints as the batch's name.
 */
export async function resolveOptionsForPrint(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fields: FieldSchemaEntry[],
): Promise<Map<string, Array<{ value: string; label: string }>>> {
  const { OPTION_BEARING_TYPES, resolveFieldOptions } = await import(
    "@/lib/fields/resolve-field-options"
  );
  const map = new Map<string, Array<{ value: string; label: string }>>();
  await Promise.all(
    fields
      .filter((field) => OPTION_BEARING_TYPES.has(field.type))
      .map(async (field) => {
        map.set(field.key, await resolveFieldOptions(supabase, field));
      }),
  );
  return map;
}

export function formatPrintValue(
  field: FieldSchemaEntry,
  raw: unknown,
  options: Array<{ value: string; label: string }>,
): string {
  if (raw === null || raw === undefined || raw === "") return "—";

  if (field.type === "multiselect" && Array.isArray(raw)) {
    const byValue = new Map(options.map((o) => [o.value, o.label]));
    return raw.map((v) => byValue.get(String(v)) ?? String(v)).join(", ") || "—";
  }
  if ((field.type === "select" || field.type === "user_ref") && options.length > 0) {
    return options.find((o) => o.value === String(raw))?.label ?? String(raw);
  }
  if (field.type === "boolean") {
    return raw ? "Yes" : "No";
  }
  if (field.type === "date" || field.type === "datetime") {
    return formatDateIST(raw as string, "d MMM yyyy");
  }
  if (field.type === "number" && (field.key === "percentage_10th" || field.key === "percentage_12th")) {
    return `${raw}%`;
  }
  return String(raw);
}

/**
 * Builds the printable cells for every key the sheet shows, given a way
 * to read a raw value for a key. The two callers differ only in that
 * function: one reads the student's columns and `custom` jsonb, the other
 * reads the lead's `profile_form_data` blob.
 */
export function buildSheetCells(
  fields: FieldSchemaEntry[],
  options: Map<string, Array<{ value: string; label: string }>>,
  rawValue: (key: string) => unknown,
): SheetCells {
  const fieldByKey = new Map(fields.map((f) => [f.key, f]));
  const cells: SheetCells = {};

  for (const key of PRINT_KEYS) {
    const field = fieldByKey.get(key);
    if (!field) continue;
    cells[key] = {
      label: field.label,
      display: formatPrintValue(field, rawValue(key), options.get(key) ?? []),
    };
  }

  return cells;
}
