import type { FieldSchemaEntry } from "@/lib/fields/get-field-schema";
import type { FieldOption } from "@/lib/fields/resolve-field-options";
import { isIngestableField } from "@/lib/leads/ingest-protected-fields";
import { normaliseFieldName } from "@/lib/leads/suggest-column-mapping";

import type { MetaLeadFieldDatum } from "./map-lead-fields";

/**
 * Meta Lead Ads forms ask more than Meta's four standard questions.
 *
 * `mapMetaLeadFields()` handles the standard ones — full_name,
 * phone_number, email, city — because Meta names those itself and they are
 * what identity resolution needs. Everything else on the form is a
 * *custom question* the advertiser wrote, and Meta names it by slugging
 * the question text: "What is your current qualification?" arrives as
 * `what_is_your_current_qualification?`, "Which exam are you interested
 * in?" as `which_exam_are_you_interested_in?`.
 *
 * Until this module existed those answers went nowhere. They were kept in
 * the enquiry's `raw` payload, faithfully, and no screen read them — so
 * AFD's forms have been asking every lead for their qualification and
 * their exam for as long as the integration has run, and the CRM has
 * shown neither. Not a mismatch between the answer and the CRM's dropdown
 * values, as it looked from the outside: the question was never read at
 * all.
 *
 * ## How a question finds its field
 *
 * In order, first match wins:
 *
 * 1. The question, normalised, equals a field's key or label.
 * 2. The question contains one of the keyword phrases below.
 * 3. The question contains a field's key or label, or vice versa.
 *
 * Step 2 is a short, deliberately boring list of the things an
 * entrance-coaching form actually asks. It is not an attempt at
 * cleverness: the configurable path is step 1, and it is already
 * admin-editable — a question that maps to nothing can be made to map by
 * renaming a field's label, or adding a custom field whose label is the
 * question, in Settings → Fields. No deploy, no migration, which is what
 * CLAUDE.md § "Configuration is data" asks for. The unmapped questions
 * are reported on the delivery so an admin can see exactly which text to
 * match.
 */
const KEYWORD_ALIASES: Array<{ phrase: string; fieldKey: string }> = [
  // "What is your current qualification?", "Which class are you in?",
  // "Present education", "Are you currently studying?"
  { phrase: "qualification", fieldKey: "education_status" },
  { phrase: "education", fieldKey: "education_status" },
  { phrase: "currentclass", fieldKey: "education_status" },
  { phrase: "whichclass", fieldKey: "education_status" },
  { phrase: "studying", fieldKey: "education_status" },
  { phrase: "grade", fieldKey: "education_status" },

  // "Which exam are you interested in?", "Entrance exam"
  { phrase: "exam", fieldKey: "interested_exams" },
  { phrase: "entrance", fieldKey: "interested_exams" },

  // "Which course do you want?", "Programme of interest"
  { phrase: "course", fieldKey: "courses_interested" },
  { phrase: "program", fieldKey: "courses_interested" },
  { phrase: "programme", fieldKey: "courses_interested" },
  { phrase: "batch", fieldKey: "courses_interested" },

  // "Online or offline?"
  { phrase: "onlineoroffline", fieldKey: "preferred_mode" },
  { phrase: "mode", fieldKey: "preferred_mode" },

  { phrase: "school", fieldKey: "school_college" },
  { phrase: "college", fieldKey: "school_college" },
  { phrase: "institute", fieldKey: "school_college" },

  { phrase: "district", fieldKey: "district" },
  { phrase: "state", fieldKey: "state" },
  { phrase: "pincode", fieldKey: "pincode" },
  { phrase: "city", fieldKey: "city" },
  { phrase: "town", fieldKey: "city" },
  { phrase: "place", fieldKey: "city" },

  { phrase: "parentname", fieldKey: "father_name" },
  { phrase: "fathername", fieldKey: "father_name" },
  { phrase: "guardian", fieldKey: "father_name" },
  { phrase: "occupation", fieldKey: "parents_occupation" },

  { phrase: "alternate", fieldKey: "alternate_phone" },
  { phrase: "whatsappnumber", fieldKey: "alternate_phone" },

  { phrase: "dateofbirth", fieldKey: "dob" },
  { phrase: "dob", fieldKey: "dob" },

  // "exam year" matches the `exam` alias above too, from the same
  // position in the question — see fieldFor() for why the specific one
  // takes it. The order of this list does not decide anything.
  { phrase: "examyear", fieldKey: "exam_year" },
  { phrase: "yearofexam", fieldKey: "exam_year" },
  { phrase: "whichyear", fieldKey: "exam_year" },
  { phrase: "attempt", fieldKey: "previous_attempts" },
];

/**
 * Meta names these itself and `mapMetaLeadFields()` already reads them
 * into the identity fields. Skipped here so one answer never gets written
 * twice by two different routes.
 */
const META_STANDARD_QUESTIONS = new Set([
  "full_name",
  "first_name",
  "last_name",
  "phone_number",
  "email",
]);

/** A lead field as the mapper needs to see it: what it is called, what type it is, and what it may legally hold. */
export interface MappableField {
  key: string;
  label: string;
  type: FieldSchemaEntry["type"];
  isCore: boolean;
  /** The resolved option list for a select/multiselect — empty for anything else. */
  options: FieldOption[];
}

export interface MappedQuestion {
  /** Meta's own name for the question, as it appears on the form. */
  question: string;
  fieldKey: string;
  fieldLabel: string;
  /** What will be written: an option value, a list of them, or the answer as typed. */
  value: unknown;
  /**
   * The answer matched no option on a select/multiselect field, so it is
   * stored exactly as the lead gave it. Nothing is lost, but the value
   * will not group with the others in a report until an admin adds it in
   * Settings → Dropdowns.
   */
  unrecognisedChoices: string[];
}

export interface CustomAnswerMapping {
  /** `{ fieldKey: value }`, ready for the lead field writer. */
  values: Record<string, unknown>;
  mapped: MappedQuestion[];
  /** Questions that matched no field, with the answer, so the delivery can say so. */
  unmapped: Array<{ question: string; answer: string }>;
}

function fieldFor(question: string, fields: MappableField[]): MappableField | null {
  const target = normaliseFieldName(question);
  if (!target) return null;

  const byKey = new Map(fields.map((f) => [normaliseFieldName(f.key), f]));
  const byLabel = new Map(fields.map((f) => [normaliseFieldName(f.label), f]));

  const exact = byKey.get(target) ?? byLabel.get(target);
  if (exact) return exact;

  /*
    Earliest keyword in the question wins, and a longer keyword beats a
    shorter one starting in the same place. Both halves earn their keep:

    - "Which school are you studying in?" contains both `school` and
      `studying`, and it is a question about a school. The first word of a
      question is what it is about; the rest is usually grammar.
    - "Which exam year are you writing?" contains `exam` and `examyear`
      from the same position, and the specific one is the right answer —
      otherwise every question about a year lands in Interested Exams.
  */
  const alias = KEYWORD_ALIASES.map((entry) => ({ entry, at: target.indexOf(entry.phrase) }))
    .filter(({ entry, at }) => at >= 0 && byKey.has(normaliseFieldName(entry.fieldKey)))
    .sort((a, b) => a.at - b.at || b.entry.phrase.length - a.entry.phrase.length)[0];
  if (alias) return byKey.get(normaliseFieldName(alias.entry.fieldKey)) ?? null;

  // Same two-way containment the CSV column mapper uses, and for the same
  // reason: a question is usually the field's name with words around it.
  return (
    fields.find((f) => {
      const key = normaliseFieldName(f.key);
      const label = normaliseFieldName(f.label);
      // Guarded against one-or-two-letter keys matching everything.
      if (key.length >= 4 && (target.includes(key) || key.includes(target))) return true;
      if (label.length >= 4 && (target.includes(label) || label.includes(target))) return true;
      return false;
    }) ?? null
  );
}

/** One typed answer against a field's option list — by option value or by the label a lead actually saw. */
function matchOption(answer: string, options: FieldOption[]): FieldOption | null {
  const target = normaliseFieldName(answer);
  if (!target) return null;
  return (
    options.find((option) => normaliseFieldName(option.value) === target) ??
    options.find((option) => normaliseFieldName(option.label) === target) ??
    null
  );
}

/**
 * Meta returns a multiselect answer as several entries in `values`, but a
 * single-line answer to a multi-choice question often arrives as one
 * comma-separated string instead. Both are the same thing to us.
 */
function splitAnswers(values: string[]): string[] {
  return values
    .flatMap((value) => value.split(/[,;]/))
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * Coerces an answer to the field's type. Deliberately forgiving compared
 * with `parseFieldValue()`, which refuses a bad value because a person is
 * standing in front of the form and can fix it. Nobody is standing in
 * front of this one: the lead has gone, the answer is all there is, and
 * dropping it would be the only unrecoverable outcome. So an answer that
 * cannot be coerced is kept as text and flagged.
 */
function coerce(
  field: MappableField,
  values: string[],
): { value: unknown; unrecognised: string[] } | null {
  const answers = field.type === "multiselect" ? splitAnswers(values) : values.map((v) => v.trim()).filter(Boolean);
  if (answers.length === 0) return null;

  if (field.type === "multiselect") {
    const unrecognised: string[] = [];
    const resolved = answers.map((answer) => {
      const option = matchOption(answer, field.options);
      if (option) return option.value;
      unrecognised.push(answer);
      return answer;
    });
    return { value: resolved, unrecognised };
  }

  const answer = answers[0];

  if (field.type === "select") {
    const option = matchOption(answer, field.options);
    return option ? { value: option.value, unrecognised: [] } : { value: answer, unrecognised: [answer] };
  }

  if (field.type === "number" || field.type === "currency") {
    // "2 attempts" is a real answer to "How many attempts?" — the digits
    // in it are the data, and refusing the whole thing loses them.
    const digits = answer.replace(/[^0-9.-]/g, "");
    const parsed = Number(digits);
    if (digits === "" || !Number.isFinite(parsed)) return { value: answer, unrecognised: [answer] };
    return { value: parsed, unrecognised: [] };
  }

  if (field.type === "boolean") {
    const yes = /^(yes|y|true|1|on)$/i.test(answer);
    const no = /^(no|n|false|0|off)$/i.test(answer);
    if (!yes && !no) return { value: answer, unrecognised: [answer] };
    return { value: yes, unrecognised: [] };
  }

  if (field.type === "date") {
    const parsed = new Date(answer);
    if (Number.isNaN(parsed.getTime())) return { value: answer, unrecognised: [answer] };
    return { value: parsed.toISOString().slice(0, 10), unrecognised: [] };
  }

  return { value: answer, unrecognised: [] };
}

/**
 * Every custom question on a Meta lead, mapped onto the CRM's own lead
 * fields. Pure: the caller loads the field catalogue and writes the
 * values, this only decides what goes where — so the rules that decide
 * where a stranger's answer lands can be tested against worked examples
 * rather than inspected on a screen after the fact.
 */
export function mapMetaCustomAnswers(
  fieldData: MetaLeadFieldDatum[],
  fields: MappableField[],
): CustomAnswerMapping {
  const mappable = fields.filter(isIngestableField);
  const values: Record<string, unknown> = {};
  const mapped: MappedQuestion[] = [];
  const unmapped: Array<{ question: string; answer: string }> = [];

  for (const datum of fieldData ?? []) {
    const question = (datum.name ?? "").trim();
    if (!question || META_STANDARD_QUESTIONS.has(question.toLowerCase())) continue;

    const answers = (datum.values ?? []).map((v) => (v ?? "").trim()).filter(Boolean);
    if (answers.length === 0) continue;

    const field = fieldFor(question, mappable);
    if (!field) {
      unmapped.push({ question, answer: answers.join(", ") });
      continue;
    }

    // A form asking two questions that both map to one field (an "exam"
    // and an "which other exams" question, say) keeps the first. Second
    // answers are reported as unmapped rather than silently overwriting.
    if (Object.hasOwn(values, field.key)) {
      unmapped.push({ question, answer: answers.join(", ") });
      continue;
    }

    const coerced = coerce(field, answers);
    if (!coerced) continue;

    values[field.key] = coerced.value;
    mapped.push({
      question,
      fieldKey: field.key,
      fieldLabel: field.label,
      value: coerced.value,
      unrecognisedChoices: coerced.unrecognised,
    });
  }

  return { values, mapped, unmapped };
}

/**
 * One line for the delivery row, so "the qualification isn't coming
 * through" is answerable from Settings → Integrations → Meta instead of a
 * SQL console. Null when every question mapped cleanly and there is
 * nothing worth saying.
 */
export function describeCustomAnswerMapping(mapping: CustomAnswerMapping): string | null {
  const parts: string[] = [];

  const unrecognised = mapping.mapped.filter((m) => m.unrecognisedChoices.length > 0);
  if (unrecognised.length > 0) {
    parts.push(
      `Saved as typed, because the answer is not one of the CRM's options: ${unrecognised
        .map((m) => `${m.fieldLabel} = "${m.unrecognisedChoices.join(", ")}"`)
        .join("; ")}. Add those values in Settings → Dropdowns to have them group in reports.`,
    );
  }

  if (mapping.unmapped.length > 0) {
    parts.push(
      `No CRM field matches these form questions, so their answers stay on the enquiry only: ${mapping.unmapped
        .map((u) => `"${u.question}"`)
        .join(", ")}. To capture one, add a field in Settings → Fields whose label is that question (or rename an existing field's label to match).`,
    );
  }

  return parts.length > 0 ? parts.join(" ") : null;
}
