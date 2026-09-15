/**
 * Whether we may message somebody, and why we think so.
 *
 * Three columns for consent have sat on `leads` since the identity layer
 * shipped and nothing has ever written them. Opt-*out* was handled
 * properly — a STOP suppresses the number and the broadcast audience
 * honours it — but opt-*in* was recorded nowhere, so the CRM could not
 * answer "on what basis did we message this person?" at all.
 *
 * ## The institute's position
 *
 * Leon's instruction, and the basis this system now records: **entering
 * somebody into the CRM is the act of adding them to the messaging list.**
 * Everyone who reaches the CRM has enquired about a course — through an
 * ad, the website, a walk-in or a phone call — and that enquiry is the
 * consent. So a lead is created with consent given, dated, and attributed
 * to the enquiry that brought them in.
 *
 * That is a business decision, not a legal opinion. What this module
 * guarantees is that the decision is *recorded per lead with a date and a
 * source*, which is the part that matters if anybody ever asks.
 *
 * ## Two independent gates, deliberately
 *
 * Consent lives on the lead. Suppression lives on the phone number
 * (see lib/whatsapp/opt-out.ts). They are separate because one person's
 * number can sit on two siblings' records, and somebody typing STOP is
 * speaking for the handset, not for a row.
 *
 * A send is allowed only when **both** agree, and the suppression list is
 * the one that wins: consent is what we believe, suppression is what they
 * told us.
 */

export const CONSENT_STATUSES = ["given", "withdrawn", "pending"] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

/**
 * How the consent was obtained, for the record.
 *
 * The lead's own source where there is one — "meta_lead_ads",
 * "walk_in" — because "they consented by filling in the Meta form on
 * 3 March" is an answer, and "consented: yes" is not.
 */
export function consentSourceFor(leadSource: string | null | undefined): string {
  const source = (leadSource ?? "").trim();
  return source ? `enquiry:${source}` : "enquiry:crm_entry";
}

/** What a brand new lead gets. Every path into the CRM runs through this. */
export function consentOnEntry(
  leadSource: string | null | undefined,
  at: Date,
): { consentStatus: ConsentStatus; consentSource: string; consentAt: Date } {
  return {
    consentStatus: "given",
    consentSource: consentSourceFor(leadSource),
    consentAt: at,
  };
}

/**
 * What a *returning* lead's consent should become when they enquire again.
 *
 * Deliberately does not resurrect a withdrawn consent. Somebody who said
 * STOP and later fills in a form has not necessarily changed their mind
 * about marketing — they may just want a prospectus — and quietly flipping
 * them back to "given" would turn a fresh enquiry into a licence to
 * resume broadcasts. Releasing an opt-out stays a deliberate act, either
 * by the person (an explicit START) or by staff on the suppressions
 * screen.
 *
 * Returns null when nothing should change.
 */
export function consentOnRepeatEnquiry(
  current: ConsentStatus | string | null,
  leadSource: string | null | undefined,
  at: Date,
): { consentStatus: ConsentStatus; consentSource: string; consentAt: Date } | null {
  if (current === "withdrawn") return null;
  if (current === "given") return null;
  // Null or "pending" — a lead from before this existed, or one whose
  // consent was never established. A fresh enquiry settles it.
  return consentOnEntry(leadSource, at);
}

/**
 * May we send this lead a marketing message?
 *
 * Both gates, in the order they actually bind. Written as one function so
 * no caller can check half of it — the audience builder, the flow engine
 * and the reminder sweep all ask the same question.
 */
export function mayReceiveMarketing(input: {
  consentStatus: string | null;
  doNotContact: boolean;
  phoneSuppressed: boolean;
}): boolean {
  if (input.phoneSuppressed) return false;
  if (input.doNotContact) return false;
  return input.consentStatus === "given";
}

/** A short phrase for a lead's detail page. */
export function describeConsent(status: string | null, at: Date | string | null): string {
  if (status === "withdrawn") return "Opted out";
  if (status === "given") return at ? "Opted in" : "Opted in (date not recorded)";
  return "Not recorded";
}
