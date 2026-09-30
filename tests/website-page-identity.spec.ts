/**
 * Telling AFD's website forms apart.
 *
 * Several hand-written forms, one per landing page and sometimes two on a
 * page, all posting to the same script with whatever field names their author
 * happened to type. These are the cases that decide whether the sources
 * report is readable or a list of forty near-identical URLs.
 */
import { describe, expect, it } from "vitest";

import {
  composeSubSource,
  pagePathOf,
  utmFromQuery,
} from "@/lib/integrations/website/page-identity";
import { mapWebsiteForm } from "@/lib/integrations/website/map-form-fields";

describe("pagePathOf", () => {
  it("reduces a full URL to its path", () => {
    expect(pagePathOf("https://afdindia.com/courses/nift")).toBe("/courses/nift");
    expect(pagePathOf("http://www.afdindia.com/contact")).toBe("/contact");
    expect(pagePathOf("//afdindia.com/apply")).toBe("/apply");
  });

  it("accepts a bare path, which is what a hidden input usually holds", () => {
    expect(pagePathOf("/courses/nift")).toBe("/courses/nift");
    expect(pagePathOf("courses/nift")).toBe("/courses/nift");
  });

  it("collapses the variants that would otherwise be separate report rows", () => {
    // The whole point. Every one of these is one landing page, and a
    // sub-source per variant would give the page no total at all.
    const same = [
      "https://afdindia.com/courses/nift",
      "https://www.afdindia.com/courses/nift/",
      "https://afdindia.com/courses/nift?utm_source=facebook",
      "https://afdindia.com/courses/NIFT",
      "https://afdindia.com//courses//nift",
      "https://afdindia.com/courses/nift#apply",
    ];
    expect(new Set(same.map(pagePathOf))).toEqual(new Set(["/courses/nift"]));
  });

  it("keeps the home page as a single slash", () => {
    expect(pagePathOf("https://afdindia.com")).toBe("/");
    expect(pagePathOf("https://afdindia.com/")).toBe("/");
    expect(pagePathOf("/")).toBe("/");
  });

  it("is null for nothing, rather than an empty label", () => {
    expect(pagePathOf(null)).toBeNull();
    expect(pagePathOf("")).toBeNull();
    expect(pagePathOf("   ")).toBeNull();
  });
});

describe("utmFromQuery", () => {
  it("pulls the campaign parameters off a page URL", () => {
    expect(
      utmFromQuery("https://afdindia.com/courses/nift?utm_source=meta&utm_campaign=nift-june"),
    ).toEqual({ utm_source: "meta", utm_campaign: "nift-june" });
  });

  it("accepts a bare query string, which is what location.search gives", () => {
    expect(utmFromQuery("?utm_medium=cpc")).toEqual({ utm_medium: "cpc" });
    expect(utmFromQuery("utm_medium=cpc")).toEqual({ utm_medium: "cpc" });
  });

  it("keeps the click ids the platforms add themselves", () => {
    expect(utmFromQuery("?gclid=abc123&fbclid=xyz")).toEqual({ gclid: "abc123", fbclid: "xyz" });
  });

  it("ignores everything that is not campaign tracking", () => {
    // A page's own parameters are not attribution and would clutter the
    // enquiry with noise.
    expect(utmFromQuery("?page=2&sort=name&utm_source=google")).toEqual({
      utm_source: "google",
    });
  });

  it("drops a parameter that is present but empty", () => {
    expect(utmFromQuery("?utm_source=&utm_campaign=june")).toEqual({ utm_campaign: "june" });
  });

  it("is null when there is no tracking at all", () => {
    expect(utmFromQuery("https://afdindia.com/courses/nift")).toBeNull();
    expect(utmFromQuery("?sort=name")).toBeNull();
    expect(utmFromQuery(null)).toBeNull();
  });
});

describe("composeSubSource", () => {
  it("puts the page first, so several forms on one page group under it", () => {
    expect(composeSubSource("/courses/nift", "Book a demo")).toBe("/courses/nift · Book a demo");
  });

  it("uses whichever half it has", () => {
    expect(composeSubSource("/contact", null)).toBe("/contact");
    expect(composeSubSource(null, "Hero enquiry")).toBe("Hero enquiry");
    expect(composeSubSource(null, null)).toBeNull();
  });
});

describe("mapWebsiteForm — page and form identity", () => {
  const base = { name: "Anjali Menon", phone: "9847012345" };

  it("distinguishes two forms on the same page", () => {
    // The case that motivated this: page and form used to collide into one
    // sub-source, so whichever field the form happened to send won and the
    // other was lost.
    const hero = mapWebsiteForm({
      ...base,
      page: "https://afdindia.com/courses/nift",
      form: "Hero enquiry",
    });
    const footer = mapWebsiteForm({
      ...base,
      page: "https://afdindia.com/courses/nift",
      form: "Footer callback",
    });

    expect(hero.ok && hero.lead.subSource).toBe("/courses/nift · Hero enquiry");
    expect(footer.ok && footer.lead.subSource).toBe("/courses/nift · Footer callback");
    expect(hero.ok && hero.lead.pagePath).toBe("/courses/nift");
    expect(hero.ok && hero.lead.formName).toBe("Hero enquiry");
  });

  it("distinguishes the same form on two pages", () => {
    const nift = mapWebsiteForm({ ...base, page: "/courses/nift", form_id: "enquiry" });
    const uceed = mapWebsiteForm({ ...base, page: "/courses/uceed", form_id: "enquiry" });

    expect(nift.ok && nift.lead.subSource).toBe("/courses/nift · enquiry");
    expect(uceed.ok && uceed.lead.subSource).toBe("/courses/uceed · enquiry");
  });

  it("reads the page from whichever field name the form author used", () => {
    for (const key of ["page", "page_url", "pageUrl", "url", "Source URL", "location"]) {
      const result = mapWebsiteForm({ ...base, [key]: "https://afdindia.com/apply" });
      expect(result.ok && result.lead.pagePath, key).toBe("/apply");
    }
  });

  it("takes UTM off the page URL when the form does not send it separately", () => {
    const result = mapWebsiteForm({
      ...base,
      page_url: "https://afdindia.com/courses/nift?utm_source=meta&utm_campaign=nift-june",
    });

    expect(result.ok && result.lead.utm).toEqual({
      utm_source: "meta",
      utm_campaign: "nift-june",
    });
    // And the query string does not leak into the label.
    expect(result.ok && result.lead.subSource).toBe("/courses/nift");
  });

  it("prefers explicit utm fields over the query string", () => {
    // A hidden input somebody filled in deliberately beats whatever URL the
    // page was loaded with — a visitor who browsed around before submitting
    // carries the query string of a different page.
    const result = mapWebsiteForm({
      ...base,
      page_url: "https://afdindia.com/apply?utm_source=stale",
      utm_source: "newsletter",
      utm_campaign: "june-open-day",
    });

    expect(result.ok && result.lead.utm).toEqual({
      utm_source: "newsletter",
      utm_campaign: "june-open-day",
    });
  });

  it("normalises however the form spelled a utm field", () => {
    const result = mapWebsiteForm({ ...base, "UTM-Source": "meta", utmMedium: "cpc" });
    expect(result.ok && result.lead.utm).toEqual({ utm_source: "meta", utm_medium: "cpc" });
  });

  it("leaves utm null when there is none, rather than an empty object", () => {
    const result = mapWebsiteForm({ ...base, page: "/contact" });
    expect(result.ok && result.lead.utm).toBeNull();
  });

  it("still works for a form that sends neither page nor name", () => {
    // The oldest forms on the site. They produce a lead with source
    // "Website" and no sub-source, which is what they did before — losing
    // the lead over a missing label would be the wrong trade.
    const result = mapWebsiteForm(base);
    expect(result.ok).toBe(true);
    expect(result.ok && result.lead.subSource).toBeNull();
    expect(result.ok && result.lead.pagePath).toBeNull();
  });

  it("keeps every field on the raw payload regardless", () => {
    const result = mapWebsiteForm({
      ...base,
      page: "/apply",
      "How did you hear about us": "My cousin",
    });
    expect(result.ok && result.lead.raw["How did you hear about us"]).toBe("My cousin");
  });
});
