import type { FieldSchemaEntry } from "@/lib/fields/get-field-schema";

/**
 * Lead fields that an *unattended* ingestion path — a Meta Lead Ads form
 * question, a website form field, an inbound WhatsApp parse — must never
 * be allowed to set, however convincingly its question happens to be
 * named.
 *
 * This is a blocklist rather than an allowlist on purpose. `field_
 * definitions` is admin-editable (CLAUDE.md § What is configurable: "Add
 * custom fields of any supported type — no migration"), so a positive
 * allowlist would mean every new custom field needed a code change before
 * an ad form could fill it in, which is exactly the rigidity the rebuild
 * exists to remove. Everything an admin adds is mappable; only the
 * handful of fields below, each of which is an invariant somewhere else,
 * are not.
 *
 * - `student_name`, `primary_phone`, `email` — identity. These are what
 *   `resolveOrCreateLead()` matched the person on; a later question
 *   answering "what is your name" differently must not rewrite the record
 *   it was just used to find.
 * - `lead_source`, `sub_source` — attribution. CLAUDE.md: first-touch
 *   source is never overwritten, and `lead_source` is not even a column
 *   (see fields/field-column.ts).
 * - `stage_id` — a lead arriving from an ad enters at the pipeline's
 *   `new` stage like every other ingestion path. Funnel positions that
 *   never happened are worse than no data.
 * - `assigned_to`, `center_id` — ownership. CLAUDE.md non-negotiable #8:
 *   assignment is the rules engine's job. A form question is not allowed
 *   to be a shortcut past it.
 * - `temperature`, `next_followup_at` — sales judgement and sales
 *   calendar. Neither belongs to whoever filled in a form.
 */
export const INGEST_PROTECTED_KEYS = new Set([
  "student_name",
  "primary_phone",
  "email",
  "lead_source",
  "sub_source",
  "stage_id",
  "assigned_to",
  "center_id",
  "temperature",
  "next_followup_at",
]);

/**
 * Types whose value is a foreign key or a stored object, not something a
 * stranger's typed answer could ever resolve to. `referred_by_lead_id` is
 * caught here (`lead_ref`) rather than needing its own entry above.
 */
export const INGEST_PROTECTED_TYPES = new Set<FieldSchemaEntry["type"]>([
  "user_ref",
  "lead_ref",
  "file",
]);

/** True when an unattended ingestion path may write this field at all. */
export function isIngestableField(field: Pick<FieldSchemaEntry, "key" | "type">): boolean {
  return !INGEST_PROTECTED_KEYS.has(field.key) && !INGEST_PROTECTED_TYPES.has(field.type);
}
