/**
 * Core select/multiselect fields that are backed by a real dropdown
 * category rather than the field definition's own freeform `options`.
 * `field_definitions.options` only applies to genuinely custom fields — a
 * core field's options come from wherever its real column actually gets
 * its values from.
 *
 * Its own module, free of `server-only` and of any client, because two
 * callers need the same answer from very different places: the UI
 * resolves options through Supabase under the reader's RLS
 * (fields/resolve-field-options.ts), and ingestion resolves them on the
 * direct db client with no session at all
 * (fields/ingest-field-catalog.ts). One map, so a Meta form answer is
 * matched against exactly the list a counsellor sees in the picker.
 */
export const CORE_KEY_TO_DROPDOWN_CATEGORY: Record<string, string> = {
  education_status: "education_status",
  preferred_mode: "preferred_mode",
  lead_source: "lead_source",
  temperature: "temperature",
  interested_exams: "exam",
  courses_interested: "course",
  // students.target_exams reuses the same "exam" category as leads'
  // interested_exams — one admin-editable exam list for the whole system,
  // not a second one to keep in sync.
  target_exams: "exam",
  // Same reasoning: students.current_course reuses leads' "course" list.
  current_course: "course",
};
