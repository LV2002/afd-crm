import { z } from "zod";

import { normalizePhone } from "@/lib/identity/normalize-phone";
import type { FieldSchemaEntry } from "@/lib/fields/get-field-schema";
import type { FieldOption } from "@/lib/fields/resolve-field-options";

/**
 * One typed parse for every value a *form* submits.
 *
 * CSV import already had `coerce-import-value.ts`, which validates by field
 * type and skips a bad cell with a warning. The two form paths had nothing
 * of the sort — they hand-coerced with `Number(raw)` and `=== "on"` — which
 * the security audit of 2026-09-15 raised as findings #6 and #10.
 *
 * The consequence was not injection (every write is parameterised) but
 * something quieter: `Number("next year")` is `NaN`, and `NaN` went into
 * the column. On the public student form a mistyped number was silently
 * dropped to null, so a student saw "thank you" and the counsellor saw a
 * blank.
 *
 * Different from the CSV version on purpose, in one way that matters: a
 * spreadsheet import has hundreds of rows and one bad cell should not stop
 * the file, so that module warns and continues. A person filling in a form
 * is standing right there and can fix it, so this one refuses and says
 * what is wrong.
 */

export type ParseFieldResult =
  | { ok: true; value: unknown }
  | { ok: false; message: string };

/** A field whose value should not be written at all — the form did not carry it. */
export const NOT_PROVIDED = Symbol("not provided");

const boundedText = z.string().max(5000, "That answer is too long.");

function fail(field: Pick<FieldSchemaEntry, "label">, what: string): ParseFieldResult {
  return { ok: false, message: `${field.label}: ${what}` };
}

/**
 * `raw` is what `FormData` gave us: a string, a list of strings for a
 * multiselect, or null when the control was not rendered.
 */
export function parseFieldValue(
  field: Pick<FieldSchemaEntry, "key" | "type" | "label" | "isRequired">,
  raw: string | string[] | null | undefined,
  options: FieldOption[] = [],
): ParseFieldResult {
  if (field.type === "multiselect") {
    const list = (Array.isArray(raw) ? raw : raw == null ? [] : [raw]).filter(
      (entry) => entry !== "",
    );
    if (list.length === 0) {
      return field.isRequired ? fail(field, "pick at least one.") : { ok: true, value: [] };
    }
    if (options.length > 0) {
      const allowed = new Set(options.map((option) => option.value));
      const unknown = list.find((entry) => !allowed.has(entry));
      if (unknown) return fail(field, `"${unknown}" is not one of the choices.`);
    }
    return { ok: true, value: list };
  }

  // A checkbox posts nothing when unticked, so absence is `false` rather
  // than "not provided" — otherwise unticking one could never be saved.
  if (field.type === "boolean") {
    return { ok: true, value: raw === "on" || raw === "true" };
  }

  if (raw == null) return { ok: true, value: NOT_PROVIDED };
  if (Array.isArray(raw)) return fail(field, "expected one answer, not several.");

  const trimmed = raw.trim();
  if (trimmed === "") {
    return field.isRequired ? fail(field, "this is required.") : { ok: true, value: null };
  }

  const tooLong = boundedText.safeParse(trimmed);
  if (!tooLong.success) return fail(field, "that answer is too long.");

  switch (field.type) {
    case "number":
    case "currency": {
      // `Number("")` is 0 and `Number("12abc")` is NaN — both were being
      // stored before. z.coerce.number() rejects the second; the empty
      // case is already handled above.
      const parsed = z.coerce.number().finite().safeParse(trimmed);
      if (!parsed.success) return fail(field, `"${trimmed}" is not a number.`);
      return { ok: true, value: parsed.data };
    }

    case "email": {
      const parsed = z.string().email().safeParse(trimmed);
      if (!parsed.success) return fail(field, `"${trimmed}" is not an email address.`);
      return { ok: true, value: parsed.data };
    }

    case "url": {
      const parsed = z.string().url().safeParse(trimmed);
      if (!parsed.success) return fail(field, `"${trimmed}" is not a web address.`);
      return { ok: true, value: parsed.data };
    }

    case "phone": {
      const normalised = normalizePhone(trimmed);
      if (!normalised) return fail(field, `"${trimmed}" is not a phone number we recognise.`);
      return { ok: true, value: normalised };
    }

    case "date": {
      const parsed = z.coerce.date().safeParse(trimmed);
      if (!parsed.success) return fail(field, `"${trimmed}" is not a date.`);
      return { ok: true, value: parsed.data.toISOString().slice(0, 10) };
    }

    case "datetime": {
      const parsed = z.coerce.date().safeParse(trimmed);
      if (!parsed.success) return fail(field, `"${trimmed}" is not a date and time.`);
      return { ok: true, value: parsed.data.toISOString() };
    }

    case "select":
    case "user_ref":
    case "lead_ref": {
      // Reference types carry an id. Checking it against the offered list
      // stops a tampered form pointing at a row the picker never showed —
      // and for `select`, stops a stale option value being written back
      // after an admin removes it.
      if (options.length > 0 && !options.some((option) => option.value === trimmed)) {
        return fail(field, "that is not one of the choices.");
      }
      return { ok: true, value: trimmed };
    }

    default:
      return { ok: true, value: trimmed };
  }
}
