import type { FieldSchemaEntry } from "@/lib/fields/get-field-schema";

/**
 * Never offered as a CSV mapping target, for reasons tied to invariants
 * elsewhere in the app, not just UI taste:
 *
 * - `assigned_to`: CLAUDE.md non-negotiable #8 — every ingestion path goes
 *   through `applyAssignment()`. Letting a spreadsheet column pre-assign a
 *   counsellor would let bulk import quietly bypass the rules engine,
 *   exactly the "one source gets a shortcut" mistake the non-negotiable
 *   exists to prevent.
 * - `stage_id`: a freshly-imported lead always enters at the pipeline's
 *   `stage_type = 'new'` stage, same as every other ingestion path
 *   (`resolveOrCreateLead()`'s own default) — importing a lead pre-staged
 *   at, say, "Payment Pending" would be funnel data that never actually
 *   happened.
 */
const NEVER_MAPPABLE_KEYS = new Set(["assigned_to", "stage_id"]);

/** No sensible plain-text CSV representation. */
const NEVER_MAPPABLE_TYPES = new Set<FieldSchemaEntry["type"]>(["user_ref", "lead_ref", "file"]);

/**
 * Core lead fields `resolveOrCreateLead()` accepts directly as part of
 * identity resolution / new-lead creation. Mapped values for these route
 * into its `ResolveLeadInput`, not the generic post-creation field update
 * — `lead_source`/`sub_source` in particular become the enquiry's
 * `source`/`subSource`, not a plain column write (see `field-column.ts`:
 * `lead_source` doesn't even have its own column, it's an alias for
 * `last_touch_source`, which `resolveOrCreateLead()` already sets from
 * `source` on every new AND existing lead).
 */
export const RESOLVE_INPUT_KEYS = new Set([
  "student_name",
  "primary_phone",
  "email",
  "father_name",
  "city",
  "district",
  "state",
  "exam_year",
  "interested_exams",
  "courses_interested",
  "center_id",
  "lead_source",
  "sub_source",
]);

/**
 * The one mapping target that is not a lead field.
 *
 * Every spreadsheet of leads anybody has ever kept has a column of what
 * was said — "no ans // visited 3-mar // wants the weekend batch". It
 * does not belong in a field: it is activity, it is what the counsellor
 * reads before ringing, and on a lead page that means the timeline.
 *
 * So a column mapped here becomes one interaction of type `note` rather
 * than a column write. The key is prefixed to keep it out of the same
 * namespace as `field_definitions.key`, which an admin can add to at
 * runtime: a custom field called `note` must not collide with this.
 */
export const IMPORT_NOTE_KEY = "__note";

const IMPORT_NOTE_FIELD: FieldSchemaEntry = {
  id: IMPORT_NOTE_KEY,
  key: IMPORT_NOTE_KEY,
  label: "Notes",
  helpText: "Logged as a note on the lead's timeline, not saved as a field.",
  type: "long_text",
  rawOptions: null,
  isCore: false,
  isRequired: false,
  section: "Activity",
  sortOrder: 9999,
  showInList: false,
  showInFilters: false,
  isEditable: true,
};

/** Every field the column mapper may offer as a target, in schema order. */
export function importableFields(fields: FieldSchemaEntry[]): FieldSchemaEntry[] {
  return [
    ...fields.filter((f) => !NEVER_MAPPABLE_KEYS.has(f.key) && !NEVER_MAPPABLE_TYPES.has(f.type)),
    IMPORT_NOTE_FIELD,
  ];
}
