import type { FieldSchemaEntry } from "@/lib/fields/get-field-schema";
import { importableFields } from "@/lib/leads/importable-fields";

/**
 * The fields a contact can carry: every lead field, except the ones that
 * only mean something once somebody is being worked as a lead.
 *
 * Reading the lead field definitions rather than keeping a list of our own is
 * the point. A field an admin adds to leads (an "aptitude score", a "school
 * board") is available on contacts the moment it exists, and moves across to
 * the lead with the contact, with no migration and no code change.
 *
 * Left out: status, owner and follow-up date (a contact has none until it is
 * a lead), the arrival time, brochure flag and referrer (sales-process data),
 * and the source and sub-source, which the LIST supplies — "this person came
 * from the St Xavier's seminar" is a property of the batch, not something to
 * retype on every row.
 */
const NOT_ON_A_CONTACT = new Set([
  "temperature",
  "assigned_to",
  "next_followup_at",
  "created_at",
  "brochure_sent",
  "referred_by_lead_id",
  "lead_source",
  "sub_source",
  "lost_reason",
  "lost_reason_detail",
]);

/** Contact columns that hold what leads call `student_name`, `primary_phone` and `email`. */
export const CONTACT_IDENTITY_KEYS = ["student_name", "primary_phone", "email"] as const;

export function contactFields(leadSchema: FieldSchemaEntry[]): FieldSchemaEntry[] {
  return importableFields(leadSchema).filter(
    (field) => !NOT_ON_A_CONTACT.has(field.key) && field.key !== "__note",
  );
}

/** True for a value that carries nothing: empty text, an empty list, null. */
export function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Splits parsed field values into the three identity columns and the rest. */
export function splitContactValues(values: Record<string, unknown>): {
  name: string;
  phone: string | null;
  email: string | null;
  fields: Record<string, unknown>;
} {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if ((CONTACT_IDENTITY_KEYS as readonly string[]).includes(key)) continue;
    if (!isBlank(value)) fields[key] = value;
  }
  return {
    name: typeof values.student_name === "string" ? values.student_name.trim() : "",
    phone: typeof values.primary_phone === "string" ? values.primary_phone : null,
    email: typeof values.email === "string" ? values.email : null,
    fields,
  };
}
