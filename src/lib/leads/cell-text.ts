import { getRawFieldValue } from "@/lib/fields/field-column";
import { formatFieldValue } from "@/lib/fields/format-field-value";
import type { FieldSchemaEntry } from "@/lib/fields/get-field-schema";
import type { FieldOption } from "@/lib/fields/resolve-field-options";

import { maskPhone } from "./mask-phone";

/**
 * The plain text a list cell copies when it is clicked.
 *
 * A phone number is copied exactly as it is shown: masked. The list never
 * holds a full number (CLAUDE.md non-negotiable #6), so a click in a list
 * cannot put one on the clipboard; revealing a number is the audited action
 * on the lead's own page.
 */
export function leadCellText(
  field: FieldSchemaEntry,
  row: Record<string, unknown>,
  optionsByKey: Record<string, FieldOption[]>,
): string {
  const value = getRawFieldValue(field, row);
  if (field.type === "phone") return maskPhone(typeof value === "string" ? value : null);
  return formatFieldValue(field, value, optionsByKey);
}
