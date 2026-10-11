import { isInterestedOption } from "@/lib/leads/interested-temperature";
import { kindOf, toTemperatureOption, type TemperatureKind } from "@/lib/leads/temperature-kinds";

/**
 * One dropdown option, flattened for the row editor.
 *
 * `metadata` is a jsonb blob whose shape depends on the category, and the
 * row editor should not have to know any of them — so the keys it needs are
 * read out here, once, with the same parsers the rest of the application
 * uses (`kindOf`, `isInterestedOption`). That is what keeps the editor and
 * the behaviour from disagreeing about what a stored value means.
 *
 * The meaning fields are only RENDERED for the temperature category; for
 * every other category they carry defaults nobody sees.
 */
export interface OptionRowData {
  id: string;
  value: string;
  label: string;
  color: string | null;
  is_active: boolean;
  /** `metadata.interested` — only meaningful for the temperature category. */
  interested: boolean;
  /** `metadata.kind` — what the system does with a lead on this temperature. */
  kind: TemperatureKind;
  /** `metadata.probability` as the text of a percentage, or "" when not set. */
  probability: string;
  /** `metadata.requires_reason` — entering this asks why. */
  requiresReason: boolean;
}

interface RawOptionRow {
  id: string;
  value: string;
  label: string;
  color: string | null;
  is_active: boolean;
  metadata: unknown;
}

export function toOptionRowData(row: RawOptionRow): OptionRowData {
  const option = toTemperatureOption({
    value: row.value,
    label: row.label,
    color: row.color,
    is_active: row.is_active,
    metadata: row.metadata,
  });
  return {
    id: row.id,
    value: row.value,
    label: row.label,
    color: row.color,
    is_active: row.is_active,
    interested: isInterestedOption(row.metadata),
    kind: kindOf(row.metadata),
    probability: option.probability === null ? "" : String(option.probability),
    requiresReason: option.requiresReason,
  };
}
