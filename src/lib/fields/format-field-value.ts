import { formatDateIST } from "@/lib/format/date";

import type { FieldSchemaEntry } from "./get-field-schema";
import type { FieldOption } from "./resolve-field-options";

/**
 * Renders one field's raw value for the list/export. Phone masking is
 * deliberately NOT handled here — it's a display-context decision (masked
 * in the list, full on a detail page after an audited reveal), not a
 * property of the field type, so the caller applies maskPhone() itself
 * where that context applies.
 */
export function formatFieldValue(
  field: FieldSchemaEntry,
  rawValue: unknown,
  optionsByKey: Record<string, FieldOption[]> = {},
): string {
  if (rawValue === null || rawValue === undefined || rawValue === "") return "—";

  switch (field.type) {
    case "boolean":
      return rawValue ? "Yes" : "No";
    case "date":
      return formatDateIST(rawValue as string, "d MMM yyyy");
    case "datetime":
      return formatDateIST(rawValue as string, "d MMM yyyy, h:mm a");
    case "multiselect": {
      if (!Array.isArray(rawValue) || rawValue.length === 0) return "—";
      const options = optionsByKey[field.key];
      return rawValue
        .map((v) => options?.find((o) => o.value === v)?.label ?? String(v))
        .join(", ");
    }
    case "select":
    // A `user_ref` is an id that resolves to a person exactly as a
    // `select` resolves to a label, and it had no case here at all — so
    // every list printed the raw uuid. The lead detail page resolves the
    // assignee itself, which is why only the list was wrong and why it
    // looked like a data problem rather than a missing branch.
    case "user_ref": {
      const options = optionsByKey[field.key];
      return options?.find((o) => o.value === rawValue)?.label ?? String(rawValue);
    }
    default:
      return String(rawValue);
  }
}
