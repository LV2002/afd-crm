/**
 * Who we may message, and on what basis.
 *
 * The rule this protects is the one that is easy to get backwards: a
 * repeat enquiry from somebody who opted out must NOT put them back on
 * the list. Somebody who said STOP and later asks for a prospectus has
 * not re-subscribed to marketing, and a system that treats any new form
 * fill as fresh consent will cheerfully resume broadcasting to people who
 * told it to stop — which is how a WhatsApp number loses its rating.
 */
import { describe, expect, it } from "vitest";

import {
  consentOnEntry,
  consentOnRepeatEnquiry,
  consentSourceFor,
  describeConsent,
  mayReceiveMarketing,
} from "../src/lib/consent/consent";

const AT = new Date("2026-03-04T09:30:00.000Z");

describe("consentSourceFor", () => {
  it("records the enquiry that brought them in, not just 'yes'", () => {
    expect(consentSourceFor("meta_lead_ads")).toBe("enquiry:meta_lead_ads");
    expect(consentSourceFor("walk_in")).toBe("enquiry:walk_in");
  });

  it("still names a source when the lead arrived without one", () => {
    expect(consentSourceFor(null)).toBe("enquiry:crm_entry");
    expect(consentSourceFor("   ")).toBe("enquiry:crm_entry");
  });
});

describe("consentOnEntry", () => {
  it("gives consent, dated, with a source", () => {
    expect(consentOnEntry("website", AT)).toEqual({
      consentStatus: "given",
      consentSource: "enquiry:website",
      consentAt: AT,
    });
  });
});

describe("consentOnRepeatEnquiry", () => {
  it("never resurrects a withdrawn consent", () => {
    // The whole point. A fresh enquiry is not a re-subscription.
    expect(consentOnRepeatEnquiry("withdrawn", "website", AT)).toBeNull();
  });

  it("leaves an existing consent alone rather than re-dating it", () => {
    // Re-stamping the date on every enquiry would lose the day they
    // actually opted in, which is the only date worth having.
    expect(consentOnRepeatEnquiry("given", "website", AT)).toBeNull();
  });

  it("settles consent for a lead that never had it recorded", () => {
    expect(consentOnRepeatEnquiry(null, "walk_in", AT)).toEqual({
      consentStatus: "given",
      consentSource: "enquiry:walk_in",
      consentAt: AT,
    });
  });

  it("settles a pending one too", () => {
    expect(consentOnRepeatEnquiry("pending", "referral", AT)?.consentStatus).toBe("given");
  });
});

describe("mayReceiveMarketing", () => {
  const base = { consentStatus: "given", doNotContact: false, phoneSuppressed: false };

  it("allows a consented, unsuppressed lead", () => {
    expect(mayReceiveMarketing(base)).toBe(true);
  });

  it("lets the suppression list beat consent", () => {
    // Consent is what we believe; suppression is what they told us.
    expect(mayReceiveMarketing({ ...base, phoneSuppressed: true })).toBe(false);
  });

  it("honours do-not-contact", () => {
    expect(mayReceiveMarketing({ ...base, doNotContact: true })).toBe(false);
  });

  it("refuses anything that is not an explicit yes", () => {
    expect(mayReceiveMarketing({ ...base, consentStatus: null })).toBe(false);
    expect(mayReceiveMarketing({ ...base, consentStatus: "pending" })).toBe(false);
    expect(mayReceiveMarketing({ ...base, consentStatus: "withdrawn" })).toBe(false);
  });
});

describe("describeConsent", () => {
  it("says what a counsellor needs to know before ringing", () => {
    expect(describeConsent("given", AT)).toBe("Opted in");
    expect(describeConsent("withdrawn", AT)).toBe("Opted out");
    expect(describeConsent(null, null)).toBe("Not recorded");
  });

  it("is honest about a consent with no date", () => {
    expect(describeConsent("given", null)).toBe("Opted in (date not recorded)");
  });
});
