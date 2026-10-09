import {
  mapFormPayload,
  submissionId as genericSubmissionId,
  type FormPayload,
} from "@/lib/integrations/form-payload/map-fields";

import { composeSubSource, pagePathOf } from "./page-identity";

/**
 * One website form submission, as a lead.
 *
 * The generic half of this — alias matching, phone validation, splitting
 * "NIFT, UCEED" into a list, collecting `utm_*` fields — moved to
 * `integrations/form-payload/map-fields.ts` when custom webhooks needed
 * exactly the same thing for Knorish and whatever comes after it. What
 * stays here is the part that is genuinely about a website: which page
 * the form was on, and what the form was called. Digging the campaign
 * parameters out of a page URL moved to the generic mapper too, once it
 * turned out every other source needed exactly the same thing.
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

  /*
    Both sources are merged by the generic mapper now.

    This used to read `generic.lead.utm ?? utmFromQuery(...)`, which took
    the explicit fields *instead of* the URL's whenever there were any —
    so a form posting one `utm_source` hidden input discarded the `gclid`
    in the URL next to it, and the gclid is the one parameter Google Ads
    adds by itself. The merge is per key now, and it happens once, for
    every source rather than only this one.
  */
  const utm = generic.lead.utm;

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
