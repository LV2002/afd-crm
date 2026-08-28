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
    case "select": {
      const options = optionsByKey[field.key];
      return options?.find((o) => o.value === rawValue)?.label ?? String(rawValue);
    }
    default:
      return String(rawValue);
  }
}
