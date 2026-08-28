import { normalizePhone } from "@/lib/identity/normalize-phone";
import type { FieldSchemaEntry } from "@/lib/fields/get-field-schema";
import type { FieldOption } from "@/lib/fields/resolve-field-options";

export interface CoerceResult {
  /** `undefined` means "field not provided" — never write this key at all (a NOT NULL column would reject an explicit null). */
  value: unknown;
  /** Non-fatal — the row still imports, but the value is worth a human's attention. */
  warning?: string;
}

function findOption(options: FieldOption[], raw: string): FieldOption | undefined {
  const needle = raw.trim().toLowerCase();
  return options.find((o) => o.value.toLowerCase() === needle || o.label.toLowerCase() === needle);
}

/**
 * Turns one raw CSV cell into the typed value `resolveOrCreateLead()` or a
 * plain column update expects. Never throws — an unparseable cell becomes
 * "not provided" (`undefined`) plus a warning, so one bad cell skips just
 * that field, never the whole row. The whole row is only ever skipped for
 * a missing/invalid `student_name` or `primary_phone` — see `import-leads.ts`.
 */
export function coerceImportValue(
  field: Pick<FieldSchemaEntry, "key" | "type" | "label">,
  raw: string | undefined | null,
  options: FieldOption[],
): CoerceResult {
  const trimmed = raw?.trim() ?? "";
  if (trimmed === "") return { value: undefined };

  switch (field.type) {
    case "phone": {
      const normalised = normalizePhone(trimmed);
      if (!normalised) {
        return { value: undefined, warning: `"${trimmed}" isn't a recognisable phone number for ${field.label}` };
      }
      return { value: normalised };
    }

    case "number":
    case "currency": {
      const n = Number(trimmed);
      if (Number.isNaN(n)) {
        return { value: undefined, warning: `"${trimmed}" isn't a number for ${field.label}` };
      }
      return { value: n };
    }

    case "boolean": {
      if (/^(yes|true|1|y)$/i.test(trimmed)) return { value: true };
      if (/^(no|false|0|n)$/i.test(trimmed)) return { value: false };
      return { value: undefined, warning: `"${trimmed}" isn't yes/no for ${field.label}` };
    }

    case "date":
    case "datetime": {
      const d = new Date(trimmed);
      if (Number.isNaN(d.getTime())) {
        return { value: undefined, warning: `"${trimmed}" isn't a recognisable date for ${field.label}` };
      }
      return { value: field.type === "date" ? d.toISOString().slice(0, 10) : d.toISOString() };
    }

    case "select": {
      const match = findOption(options, trimmed);
      if (!match) {
        return { value: undefined, warning: `"${trimmed}" isn't a recognised option for ${field.label}` };
      }
      return { value: match.value };
    }

    case "multiselect": {
      const tokens = trimmed
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean);
      const matched: string[] = [];
      const unmatched: string[] = [];
      for (const token of tokens) {
        const match = findOption(options, token);
        if (match) matched.push(match.value);
        else unmatched.push(token);
      }
      if (matched.length === 0) {
        return { value: undefined, warning: `No recognised options in "${trimmed}" for ${field.label}` };
      }
      return {
        value: matched,
        warning: unmatched.length > 0 ? `Ignored unrecognised value(s) in ${field.label}: ${unmatched.join(", ")}` : undefined,
      };
    }

    // text, long_text, email, url — and anything else: pass the trimmed string through as-is.
    default:
      return { value: trimmed };
  }
}
