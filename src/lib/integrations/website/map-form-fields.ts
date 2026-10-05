import {
  ALIASES,
  mapFormPayload,
  pick,
  submissionId as genericSubmissionId,
  type FormPayload,
} from "@/lib/integrations/form-payload/map-fields";

import { composeSubSource, pagePathOf, utmFromQuery } from "./page-identity";

/**
 * One website form submission, as a lead.
 *
 * The generic half of this — alias matching, phone validation, splitting
 * "NIFT, UCEED" into a list, collecting `utm_*` fields — moved to
 * `integrations/form-payload/map-fields.ts` when custom webhooks needed
 * exactly the same thing for Knorish and whatever comes after it. What
 * stays here is the part that is genuinely about a website: which page
 * the form was on, what the form was called, and the UTM parameters that
 * have to be dug out of a page URL's query string.
 */

export type WebsiteFormPayload = FormPayload;

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

export function mapWebsiteForm(payload: WebsiteFormPayload): MapResult | MapFailure {
  const generic = mapFormPayload(payload);
  if (!generic.ok) return generic;

  const pagePath = pagePathOf(generic.lead.pageValue);
  const formName = generic.lead.formName;

  // Explicit utm_* fields win over anything parsed out of the URL: a form
  // that posts them as real fields has done the work deliberately, whereas
  // a query string may be whatever was on the page when it loaded.
  const utm = generic.lead.utm ?? utmFromQuery(pick(payload, ALIASES.query));

  return {
    ok: true,
    lead: {
      studentName: generic.lead.studentName,
      primaryPhone: generic.lead.primaryPhone,
      email: generic.lead.email,
      city: generic.lead.city,
      examYear: generic.lead.examYear,
      interestedExams: generic.lead.interestedExams,
      coursesInterested: generic.lead.coursesInterested,
      subSource: composeSubSource(pagePath, formName),
      pagePath,
      formName,
      utm,
      raw: generic.lead.raw,
    },
  };
}

export const submissionId = genericSubmissionId;
