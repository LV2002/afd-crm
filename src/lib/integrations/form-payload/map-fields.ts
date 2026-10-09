import { normalizePhone } from "@/lib/identity/normalize-phone";

import { mergeUtm, utmFromQuery } from "./utm";

/**
 * Turning an arbitrary JSON payload into a lead.
 *
 * Extracted from the website form mapper, which solved this problem
 * first and solved it generically: field names are whatever the person
 * who built the form happened to type — `name`, `Full Name`,
 * `student-name`, `your_name` — so the mapping is by *alias*, case- and
 * punctuation-insensitive, and nothing is ever dropped. Every field the
 * payload carried is kept verbatim on the enquiry's raw record, whether
 * or not it was recognised.
 *
 * Which makes it exactly what a custom webhook needs. A course platform,
 * a Google Form, a Zapier step and a landing page nobody told us about
 * all post a flat object of strings with no agreement about what the keys
 * are called, and none of them will change to suit us.
 *
 * Only two things are required — a name and a phone — because they are
 * what `resolveOrCreateLead()` needs to identify a person.
 */

export interface FormPayload {
  [field: string]: unknown;
}

export interface MappedFormLead {
  studentName: string;
  primaryPhone: string;
  email: string | null;
  city: string | null
  examYear: string | null;
  interestedExams: string[] | null;
  coursesInterested: string[] | null;
  /** The form's own name or id, when it sent one. */
  formName: string | null;
  /** Anything that looked like a page or URL, unparsed. */
  pageValue: string | null;
  /** UTM parameters and click ids, from explicit fields or the query string. */
  utm: Record<string, string> | null;
  /** Everything the payload sent, recognised or not. */
  raw: Record<string, unknown>;
}

export type MapResult = { ok: true; lead: MappedFormLead };
export type MapFailure = { ok: false; reason: string };

/**
 * Extra aliases an admin added for one source, merged in front of the
 * built-in ones.
 *
 * Knorish calls the buyer `student_name` and we already know that one;
 * the next platform will call it something nobody has thought of, and the
 * fix for that should be a text box rather than a deploy.
 */
export type ExtraAliases = Partial<Record<keyof typeof ALIASES, readonly string[]>>;

/** `Full Name`, `full-name` and `full_name` are the same key. */
export function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export const ALIASES = {
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

export function pick(
  payload: FormPayload,
  aliases: readonly string[],
  extra?: readonly string[],
): string | null {
  const byKey = new Map<string, unknown>();
  for (const [key, value] of Object.entries(payload)) byKey.set(normaliseKey(key), value);

  // The admin's own aliases are tried first: they were added because the
  // built-in list got this payload wrong.
  for (const alias of [...(extra ?? []).map(normaliseKey), ...aliases]) {
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
export function toList(value: string | null): string[] | null {
  if (!value) return null;
  const parts = value
    .split(/[,;/|]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : null;
}

/**
 * `utm_source`, `utm_campaign` and friends sent as their own fields.
 *
 * Separate from the query-string parse because a hidden input a form
 * author filled in on purpose is better evidence than the URL the page
 * happened to be loaded with — somebody who navigated around the site
 * before submitting carries the query string of whichever page they
 * landed on.
 */
export function explicitUtmFields(payload: FormPayload): Record<string, string> | null {
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

export function mapFormPayload(
  payload: FormPayload,
  extraAliases?: ExtraAliases,
): MapResult | MapFailure {
  const name = pick(payload, ALIASES.name, extraAliases?.name);
  const phoneRaw = pick(payload, ALIASES.phone, extraAliases?.phone);

  // Both failures name the keys that DID arrive, because the person
  // reading this is looking at a delivery that did not become a lead and
  // needs to know what the sender actually called things.
  const keys = Object.keys(payload).slice(0, 12).join(", ") || "nothing";
  if (!name) return { ok: false, reason: `No name field found. Fields sent: ${keys}.` };
  if (!phoneRaw) return { ok: false, reason: `No phone field found. Fields sent: ${keys}.` };

  // Checked here rather than left to resolveOrCreateLead so the failure
  // is recorded against this delivery with a readable reason, instead of
  // surfacing as a thrown error three layers down.
  if (!normalizePhone(phoneRaw)) {
    return { ok: false, reason: `"${phoneRaw}" is not a phone number we can use.` };
  }

  const exams = toList(pick(payload, ALIASES.exams, extraAliases?.exams));

  const pageValue = pick(payload, ALIASES.page, extraAliases?.page);

  /*
    Campaign attribution, from every place a form may carry it.

    Until now only the explicit `utm_*` fields were read here, so a
    sender that posted its page URL and nothing else — which is most of
    them — produced a lead attributed to nothing at all. `ALIASES.query`
    has described where the parameters live since this module was
    written; the website mapper read it and this one never did, so the
    same submission was attributed through one route and not the other.

    Three sources, weakest first:

    1. **The page field.** `ALIASES.page` and `ALIASES.query` overlap on
       `pageurl`, `url` and `location` but not on `page`, `pagepath`,
       `sourceurl` or `referrer` — so a form posting its full address
       under the commonest key of all, `page`, had the path read off it
       and the query string thrown away. Reading both costs one call and
       closes the gap; a page value with no parameters simply yields
       nothing, and `pagePathOf()` strips the query anyway, so nothing
       is double-counted.
    2. **An explicit query field**, where a form posts `location.search`
       separately. More specific than the page, so it wins.
    3. **Explicit `utm_*` fields**, which somebody set up deliberately.

    Merged key by key rather than wholesale, so a single hidden input
    cannot discard everything beside it: see mergeUtm().
  */
  const utm = mergeUtm(
    mergeUtm(utmFromQuery(pageValue), utmFromQuery(pick(payload, ALIASES.query, extraAliases?.query))),
    explicitUtmFields(payload),
  );

  return {
    ok: true,
    lead: {
      studentName: name,
      primaryPhone: phoneRaw,
      email: pick(payload, ALIASES.email, extraAliases?.email),
      city: pick(payload, ALIASES.city, extraAliases?.city),
      examYear: pick(payload, ALIASES.examYear, extraAliases?.examYear),
      // The same box usually means both: "which course are you interested
      // in" is answered with an exam name as often as a course name.
      // Recorded on both rather than guessing wrong.
      interestedExams: exams,
      coursesInterested: exams,
      formName: pick(payload, ALIASES.formName, extraAliases?.formName),
      pageValue,
      utm,
      raw: payload as Record<string, unknown>,
    },
  };
}

/**
 * A stable id for one submission, so a retried delivery does not create a
 * second lead. Most senders supply their own id; when they do not, the
 * phone and timestamp together are a reasonable stand-in — the same
 * person submitting the same form twice in the same second is one
 * submission delivered twice.
 */
export function submissionId(payload: FormPayload): string {
  const explicit = pick(payload, ["submissionid", "id", "eventid", "responseid", "orderid", "transactionid"]);
  if (explicit) return explicit;

  const phone = normalizePhone(pick(payload, ALIASES.phone) ?? "") ?? "unknown";
  const at = pick(payload, ["timestamp", "submittedat", "time", "date", "createdat"]) ?? "";
  return `${phone}:${at || Date.now()}`;
}
