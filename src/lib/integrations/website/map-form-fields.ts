import { normalizePhone } from "@/lib/identity/normalize-phone";

/**
 * Turning one website form submission into a lead.
 *
 * The problem this solves is that AFD's site forms were not designed for
 * this CRM. They post to a Google Apps Script that appends a row to a
 * sheet, and their field names are whatever the person building each form
 * happened to type — `name`, `Full Name`, `student-name`, `your_name`.
 * There may be several forms, built at different times, and they will not
 * agree.
 *
 * So the mapping is by *alias*, case- and punctuation-insensitive, and
 * nothing is ever dropped: every field the form sent is kept verbatim on
 * the enquiry's raw payload, whether or not it was recognised. A question
 * added to a form next year still arrives, still gets stored, and can be
 * mapped later without having lost the submissions in between.
 *
 * Only two things are actually required — a name and a phone — because
 * they are what `resolveOrCreateLead()` needs to identify a person.
 */

export interface WebsiteFormPayload {
  [field: string]: unknown;
}

export interface MappedWebsiteLead {
  studentName: string;
  primaryPhone: string;
  email: string | null;
  city: string | null;
  examYear: string | null;
  interestedExams: string[] | null;
  coursesInterested: string[] | null;
  /** The form's own name, so several forms on one site stay distinguishable. */
  subSource: string | null;
  /** Everything the form sent, recognised or not. */
  raw: Record<string, unknown>;
}

export interface MapResult {
  ok: true;
  lead: MappedWebsiteLead;
}

export interface MapFailure {
  ok: false;
  reason: string;
}

/** `Full Name`, `full-name` and `full_name` are the same key. */
function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const ALIASES = {
  name: ["name", "fullname", "studentname", "yourname", "applicantname", "candidatename"],
  phone: ["phone", "mobile", "phonenumber", "mobilenumber", "contact", "contactnumber", "whatsapp", "whatsappnumber"],
  email: ["email", "emailaddress", "mail", "youremail"],
  city: ["city", "town", "location", "place"],
  examYear: ["examyear", "year", "targetyear", "yearofexam"],
  exams: ["exam", "exams", "interestedexam", "interestedexams", "course", "courses", "courseinterested", "programme", "program"],
  formName: ["form", "formname", "source", "page", "formtitle"],
} as const;

function pick(payload: WebsiteFormPayload, aliases: readonly string[]): string | null {
  const byKey = new Map<string, unknown>();
  for (const [key, value] of Object.entries(payload)) byKey.set(normaliseKey(key), value);

  for (const alias of aliases) {
    const value = byKey.get(alias);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

/**
 * A form might send "NIFT, UCEED" in one box, or a real array from a
 * multi-select. Both become a list; neither is validated against the
 * dropdown, because a value the institute has not configured yet is still
 * worth keeping — it lands on the enquiry and a counsellor sorts it out.
 */
function toList(value: string | null): string[] | null {
  if (!value) return null;
  const parts = value
    .split(/[,;/|]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : null;
}

export function mapWebsiteForm(payload: WebsiteFormPayload): MapResult | MapFailure {
  const name = pick(payload, ALIASES.name);
  const phoneRaw = pick(payload, ALIASES.phone);

  if (!name) return { ok: false, reason: "No name field found in the submission." };
  if (!phoneRaw) return { ok: false, reason: "No phone field found in the submission." };

  // Checked here rather than left to resolveOrCreateLead so the failure
  // is recorded against this delivery with a readable reason, instead of
  // surfacing as a thrown error three layers down.
  if (!normalizePhone(phoneRaw)) {
    return { ok: false, reason: `"${phoneRaw}" is not a phone number we can use.` };
  }

  const exams = toList(pick(payload, ALIASES.exams));

  return {
    ok: true,
    lead: {
      studentName: name,
      primaryPhone: phoneRaw,
      email: pick(payload, ALIASES.email),
      city: pick(payload, ALIASES.city),
      examYear: pick(payload, ALIASES.examYear),
      // The same box usually means both on these forms: "which course are
      // you interested in" is answered with an exam name as often as a
      // course name. Recorded on both rather than guessing wrong.
      interestedExams: exams,
      coursesInterested: exams,
      subSource: pick(payload, ALIASES.formName),
      raw: payload as Record<string, unknown>,
    },
  };
}

/**
 * A stable id for one submission, so a retried delivery does not create a
 * second lead. The Apps Script sends its own `submission_id`; when it
 * does not, the phone and timestamp together are a reasonable stand-in —
 * the same person submitting the same form twice in the same second is
 * one submission delivered twice.
 */
export function submissionId(payload: WebsiteFormPayload): string {
  const explicit = pick(payload, ["submissionid", "id", "eventid", "responseid"]);
  if (explicit) return explicit;

  const phone = normalizePhone(pick(payload, ALIASES.phone) ?? "") ?? "unknown";
  const at = pick(payload, ["timestamp", "submittedat", "time", "date"]) ?? "";
  return `${phone}:${at || Date.now()}`;
}
