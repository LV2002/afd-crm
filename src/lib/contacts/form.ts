import type { FieldSchemaEntry } from "@/lib/fields/get-field-schema";
import { parseFieldValue } from "@/lib/fields/parse-field-value";
import type { FieldOption } from "@/lib/fields/resolve-field-options";

import { splitContactValues } from "./fields";
import type { ContactInput } from "./save";

/** The name an input carries for a field: `field_<key>`. */
export const fieldInputName = (key: string): string => `field_${key}`;

export type ParsedContactForm =
  | { ok: true; input: ContactInput }
  | { ok: false; message: string };

/**
 * Reads a contact form into the shape `saveContact()` takes.
 *
 * Every value goes through the same typed parse the lead forms use, so a
 * phone is normalised to E.164, a number is a number, and a choice is one of
 * the choices. A person is standing at the form, so the first problem stops
 * the save and says what it is, rather than dropping the cell silently the
 * way a spreadsheet import has to.
 */
export function parseContactForm(
  formData: FormData,
  fields: FieldSchemaEntry[],
  optionsByKey: Record<string, FieldOption[]>,
): ParsedContactForm {
  const values: Record<string, unknown> = {};

  for (const field of fields) {
    const name = fieldInputName(field.key);
    const raw = field.type === "multiselect" ? formData.getAll(name).map(String) : (formData.get(name) as string | null);
    const parsed = parseFieldValue(
      // Only the name is compulsory on this form: the rest of a seminar sheet
      // is whatever the child filled in. Phone-or-email is checked below.
      { ...field, isRequired: field.key === "student_name" },
      raw,
      optionsByKey[field.key] ?? [],
    );
    if (!parsed.ok) return { ok: false, message: parsed.message };
    if (typeof parsed.value !== "symbol" && parsed.value !== undefined) values[field.key] = parsed.value;
  }

  const input = splitContactValues(values);
  if (!input.name) return { ok: false, message: "Name is required." };
  if (!input.phone && !input.email) {
    return { ok: false, message: "Enter a phone number or an email address, so this person can be recognised." };
  }
  return { ok: true, input };
}
