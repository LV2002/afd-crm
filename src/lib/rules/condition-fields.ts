import type { ConditionField, ConditionOp } from "@/lib/assignment/evaluate-conditions";

/**
 * What a human needs to know about each rule condition field.
 *
 * `evaluate-conditions.ts` owns the whitelist of fields a rule may test —
 * this owns how each of them is *presented*: what it is called in English,
 * where its known values come from, and which operators make sense on it.
 *
 * The `satisfies` at the bottom is the point of the file. Add a field to
 * FIELD_MAP without adding it here and the build fails, rather than the
 * rule builder quietly offering a field with no label and no sensible
 * operators.
 *
 * The operator restriction is not cosmetic. `interested_exams` is a text
 * array in Postgres, and the evaluator compares `equals` with `===` — an
 * array is never `===` a string, so a rule saying "interested exams equals
 * NIFT" silently matches nothing forever. Array fields therefore offer
 * `contains` and the two emptiness checks and nothing else.
 */

export type ValueInput = "options" | "number" | "text";

export interface ConditionFieldMeta {
  label: string;
  input: ValueInput;
  /**
   * Where the page looks up this field's known values. `dropdown:` names a
   * `dropdown_options` category, so an admin adding a lead source gets it
   * in the rule builder with no deploy.
   */
  optionSource?: "centers" | "states" | "districts" | `dropdown:${string}`;
  /** True for the text[] columns: only `contains` behaves correctly on them. */
  isArray?: boolean;
  hint?: string;
}

const FIELDS = {
  source: {
    label: "Lead source",
    input: "options",
    optionSource: "dropdown:lead_source",
    hint: "The most recent source — a repeat enquiry from a new channel changes it.",
  },
  sub_source: { label: "Sub-source", input: "text", hint: "Free text, e.g. a specific form or page." },
  campaign: { label: "Campaign", input: "text", hint: "The ad campaign id from Meta or Google." },
  center_id: { label: "Centre", input: "options", optionSource: "centers" },
  city: { label: "City", input: "text" },
  district: { label: "District", input: "options", optionSource: "districts" },
  state: { label: "State", input: "options", optionSource: "states" },
  exam_year: {
    label: "Exam year",
    input: "number",
    hint: "The year they sit the exam, not the year they are in now.",
  },
  temperature: { label: "Temperature", input: "options", optionSource: "dropdown:temperature" },
  preferred_mode: { label: "Preferred mode", input: "options", optionSource: "dropdown:preferred_mode" },
  interested_exams: {
    label: "Interested exams",
    input: "options",
    optionSource: "dropdown:exam",
    isArray: true,
  },
  courses_interested: {
    label: "Courses interested",
    input: "options",
    optionSource: "dropdown:course",
    isArray: true,
  },
} as const satisfies Record<ConditionField, ConditionFieldMeta>;

/**
 * Exported through the uniform type rather than the literal one: with
 * `as const` every entry has its own shape, so `CONDITION_FIELDS[f].hint`
 * would not typecheck for the entries that happen to have no hint. The
 * `satisfies` above still does its job — a missing field is a build error.
 */
export const CONDITION_FIELDS: Record<ConditionField, ConditionFieldMeta> = FIELDS;

export const CONDITION_FIELD_KEYS = Object.keys(CONDITION_FIELDS) as ConditionField[];

export const OP_LABELS: Record<ConditionOp, string> = {
  equals: "is",
  not_equals: "is not",
  in: "is any of",
  not_in: "is none of",
  contains: "includes",
  is_empty: "is blank",
  is_not_empty: "is filled in",
  gt: "is more than",
  lt: "is less than",
  between: "is between",
};

/** Operators that take no value at all — the value box disappears for these. */
export const VALUELESS_OPS: ConditionOp[] = ["is_empty", "is_not_empty"];

/** Operators whose value is a list rather than one entry. */
export const MULTI_VALUE_OPS: ConditionOp[] = ["in", "not_in"];

/**
 * Which operators to offer for a given field. Deliberately narrower than
 * the evaluator supports: every combination offered here does something,
 * which is not true of the full cross product.
 */
export function opsFor(field: ConditionField): ConditionOp[] {
  const meta = CONDITION_FIELDS[field];
  if (meta.isArray) return ["contains", "is_empty", "is_not_empty"];
  if (meta.input === "number") {
    return ["equals", "not_equals", "in", "not_in", "gt", "lt", "between", "is_empty", "is_not_empty"];
  }
  if (meta.input === "options") {
    return ["equals", "not_equals", "in", "not_in", "is_empty", "is_not_empty"];
  }
  return ["equals", "not_equals", "in", "not_in", "contains", "is_empty", "is_not_empty"];
}
