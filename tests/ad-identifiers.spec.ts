/**
 * Whether a form submission can be shown against what the ad cost.
 *
 * `ad_spend_daily` holds what Google and Meta charged per campaign per
 * day, and the Ad Performance report joins it to leads on
 * `enquiries.campaign_id`. Lead Ads supply that id themselves; a landing
 * page form did not supply one at all, so every lead a Google search
 * campaign produced was invisible against its spend, and cost per lead
 * for Google was unanswerable with nothing on screen saying why.
 *
 * The subtle half is what must NOT become a campaign id. Pure logic, no
 * database.
 */
import { describe, expect, it } from "vitest";

import { adIdentifiersFrom } from "../src/lib/integrations/form-payload/ad-identifiers";

describe("picking the campaign id out of a form submission", () => {
  it("takes an explicit campaign_id field", () => {
    // A hidden input somebody put there on purpose beats anything the
    // URL happened to carry.
    expect(adIdentifiersFrom({ campaign_id: "22334455667", utm_campaign: "brand-search" })).toEqual(
      { campaignId: "22334455667", adId: null },
    );
  });

  it("takes utm_campaign when it is a platform id", () => {
    // Google's ValueTrack {campaignid} and Meta's {{campaign.id}} both
    // substitute a number, which is what makes the join work.
    expect(adIdentifiersFrom({ utm_campaign: "22334455667" }).campaignId).toBe("22334455667");
  });

  it("refuses a campaign NAME as an id", () => {
    // The whole point. `brand-search-oct` matches no row in
    // ad_spend_daily, so accepting it would put a campaign with leads and
    // zero spend next to a campaign with spend and zero leads — the same
    // money and the same leads counted as two things. A blank is
    // obviously missing; a wrong row looks like an answer.
    expect(adIdentifiersFrom({ utm_campaign: "brand-search-oct" }).campaignId).toBeNull();
    expect(adIdentifiersFrom({ utm_campaign: "NID Foundation 2026" }).campaignId).toBeNull();
  });

  it("refuses a number too short to be a platform id", () => {
    // Somebody numbering their own campaigns 1, 2, 3 would otherwise
    // collide with nothing — or, worse, with something.
    expect(adIdentifiersFrom({ utm_campaign: "12" }).campaignId).toBeNull();
  });

  it("reads the ad id the same way", () => {
    expect(adIdentifiersFrom({ ad_id: "98765432100" }).adId).toBe("98765432100");
    expect(adIdentifiersFrom({ utm_content: "70123456789" }).adId).toBe("70123456789");
    expect(adIdentifiersFrom({ utm_content: "hero-banner-v2" }).adId).toBeNull();
  });

  it("copes with no attribution at all", () => {
    // A walk-in enquiry typed into the same form. Must not throw, and
    // must not invent an id.
    expect(adIdentifiersFrom(null)).toEqual({ campaignId: null, adId: null });
    expect(adIdentifiersFrom({})).toEqual({ campaignId: null, adId: null });
    expect(adIdentifiersFrom({ utm_source: "google", gclid: "abc123" })).toEqual({
      campaignId: null,
      adId: null,
    });
  });

  it("trims what a form sent", () => {
    expect(adIdentifiersFrom({ campaign_id: "  22334455667 " }).campaignId).toBe("22334455667");
  });
});
