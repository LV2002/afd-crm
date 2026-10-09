/**
 * Campaign attribution, from a page URL and from fields of its own.
 *
 * The question behind every assertion here is Leon's: several Google
 * Ads campaigns run at once, and a lead is worth knowing the campaign
 * for. A parameter silently dropped does not look like a bug — it looks
 * like a lead that came from nowhere.
 */
import { describe, expect, it } from "vitest";

import { mergeUtm, utmFromQuery } from "@/lib/integrations/form-payload/utm";
import { mapFormPayload } from "@/lib/integrations/form-payload/map-fields";
import { adIdentifiersFrom } from "@/lib/integrations/form-payload/ad-identifiers";
import { mapWebsiteForm } from "@/lib/integrations/website/map-form-fields";

const PERSON = { name: "Ananya Menon", phone: "9847012345" };

describe("merging the two sources", () => {
  it("keeps a parameter only the URL had", () => {
    expect(mergeUtm({ gclid: "abc", utm_source: "google" }, { utm_source: "meta" })).toEqual({
      gclid: "abc",
      utm_source: "meta",
    });
  });

  it("lets a deliberate field override a stale URL", () => {
    expect(mergeUtm({ utm_campaign: "old" }, { utm_campaign: "new" })).toEqual({
      utm_campaign: "new",
    });
  });

  it("is whichever side exists when only one does", () => {
    expect(mergeUtm({ gclid: "abc" }, null)).toEqual({ gclid: "abc" });
    expect(mergeUtm(null, { gclid: "abc" })).toEqual({ gclid: "abc" });
    expect(mergeUtm(null, null)).toBeNull();
  });
});

describe("a payload that carries only a page URL", () => {
  /*
    The case that produced nothing at all before this: a sender that
    forwards the address the form was on and nothing else, which is most
    form builders and every no-code step.
  */
  it("is attributed from the query string", () => {
    const mapped = mapFormPayload({
      ...PERSON,
      page_url: "https://afdindia.com/foundation?utm_source=google&utm_medium=cpc&utm_campaign=22334455&gclid=Cj0KCQ",
    });

    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.lead.utm).toEqual({
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "22334455",
      gclid: "Cj0KCQ",
    });
  });

  it("reaches Ad Performance, which is the point of capturing it", () => {
    const mapped = mapFormPayload({
      ...PERSON,
      url: "https://afdindia.com/nift?utm_campaign=22334455&utm_content=99887766",
    });

    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    // Numeric because Google's ValueTrack {campaignid} and {creative}
    // substitute ids — see docs/GOOGLE-ADS-SETUP.md. A campaign *name*
    // would be refused here on purpose.
    expect(adIdentifiersFrom(mapped.lead.utm)).toEqual({
      campaignId: "22334455",
      adId: "99887766",
    });
  });

  it("ignores the ordinary query parameters a page happens to carry", () => {
    const mapped = mapFormPayload({ ...PERSON, page: "https://afdindia.com/x?sort=name&ref=nav" });

    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.lead.utm).toBeNull();
  });
});

describe("a payload that carries both", () => {
  /*
    The regression this change exists to prevent, and the one that bit
    the website mapper: a form posting a single hidden input used to
    discard everything in the URL beside it — including the gclid, which
    is the one parameter Google Ads adds by itself through auto-tagging
    and therefore the one nobody remembers to wire up.
  */
  it("does not lose the gclid in the URL because one field was posted", () => {
    const mapped = mapFormPayload({
      ...PERSON,
      page_url: "https://afdindia.com/foundation?gclid=Cj0KCQ&utm_campaign=22334455",
      utm_source: "google",
    });

    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.lead.utm).toEqual({
      gclid: "Cj0KCQ",
      utm_campaign: "22334455",
      utm_source: "google",
    });
  });

  it("prefers the explicit field where the two disagree", () => {
    const mapped = mapFormPayload({
      ...PERSON,
      page_url: "https://afdindia.com/x?utm_campaign=landed-on-this-one",
      utm_campaign: "22334455",
    });

    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.lead.utm?.utm_campaign).toBe("22334455");
  });
});

describe("the website form, which already did this", () => {
  it("still reads the query string", () => {
    const mapped = mapWebsiteForm({
      ...PERSON,
      page: "https://afdindia.com/courses/nift?utm_source=google&utm_campaign=22334455",
      form: "Book a demo",
    });

    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.lead.utm).toEqual({ utm_source: "google", utm_campaign: "22334455" });
    // Unchanged by the refactor: the page is still reduced to a path, and
    // the query string still belongs to utm rather than the sub-source.
    expect(mapped.lead.pagePath).toBe("/courses/nift");
    expect(mapped.lead.subSource).toBe("/courses/nift · Book a demo");
  });

  it("now keeps the URL's click id alongside its own hidden inputs", () => {
    const mapped = mapWebsiteForm({
      ...PERSON,
      page: "https://afdindia.com/courses/nift?gclid=Cj0KCQ",
      utm_source: "google",
      utm_medium: "cpc",
    });

    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.lead.utm).toEqual({
      gclid: "Cj0KCQ",
      utm_source: "google",
      utm_medium: "cpc",
    });
  });
});

describe("utmFromQuery, wherever it is imported from", () => {
  it("is one implementation, not two", async () => {
    const fromWebsite = await import("@/lib/integrations/website/page-identity");
    expect(fromWebsite.utmFromQuery).toBe(utmFromQuery);
  });
});
