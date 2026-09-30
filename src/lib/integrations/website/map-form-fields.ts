import { normalizePhone } from "@/lib/identity/normalize-phone";

import { composeSubSource, pagePathOf, utmFromQuery } from "./page-identity";

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
  /**
   * Page and form together — "/courses/nift · Book a demo" — so the sources
   * report answers "which page produced this" without any new screen.
   */
  subSource: string | null;
  /** The page's path, on its own, for anything that wants to group by page. */
  pagePath: string | null;
  /** The form's own name or id, on its own. */
  formName: string | null;
  /** UTM parameters and click ids off the page's query string, when present. */
  utm: Record<string, string> | null;
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
  formName: ["form", "formname", "formid", "formtitle", "formlabel"],
  page: ["page", "pageurl", "pagepath", "url", "sourceurl", "pagetitle", "referrer", "location"],
  /**
   * Where the UTM parameters come from. Usually the full page URL, but a
   * form that posts `location.search` on its own works too.
   */
  query: ["query", "querystring", "search", "pageurl", "url", "location"],
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

/**
 * `utm_source`, `utm_campaign` and friends sent as their own form fields.
 *
 * Separate from the query-string parse because a hidden input a form author
 * filled in on purpose is better evidence than the URL the page happened to
 * be loaded with — somebody who navigated around the site before submitting
 * carries the query string of whichever page they landed on.
 */
function explicitUtmFields(payload: WebsiteFormPayload): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    const name = normaliseKey(key);
    const isUtm = name.startsWith("utm") && name.length > 3;
    if (!isUtm && name !== "gclid" && name !== "fbclid") continue;
    if (typeof value !== "string" || !value.trim()) continue;
    // Normalised back to the conventional spelling so `utmSource`,
    // `utm-source` and `UTM_Source` all land on one key.
    const canonical = isUtm ? `utm_${name.slice(3)}` : name;
    out[canonical] = value.trim();
  }
  return Object.keys(out).length > 0 ? out : null;
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
  const pagePath = pagePathOf(pick(payload, ALIASES.page));
  const formName = pick(payload, ALIASES.formName);

  // Explicit utm_* fields win over anything parsed out of the URL: a form
  // that posts them as real fields has done the work deliberately, whereas
  // a query string may be whatever was on the page when it loaded.
  const explicitUtm = explicitUtmFields(payload);
  const utm = explicitUtm ?? utmFromQuery(pick(payload, ALIASES.query));

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
      subSource: composeSubSource(pagePath, formName),
      pagePath,
      formName,
      utm,
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
