/**
 * A paid feed that does not call itself "google".
 *
 * Leon wired his Google Ads lead form up as a custom webhook and named
 * the source "Google Ads", which is the right name for the sources
 * report and invisible to Ad Performance: the join tested the source
 * against the literal words `meta` and `google`. These tests pin the
 * fix and, as much, pin the thing that must not change — the built-in
 * webhooks, whose historic rows have only their source to go on.
 */
import { describe, expect, it } from "vitest";

import { attributeLeads } from "@/lib/reports/ad-performance";

function attribute(
  enquiryRows: Array<{
    leadId: string;
    source: string;
    campaignId: string | null;
    adPlatform?: string | null;
  }>,
) {
  return attributeLeads({
    leadIds: Array.from(new Set(enquiryRows.map((row) => row.leadId))),
    enquiryRows,
    enrolmentRows: [],
    paymentRows: [],
  });
}

describe("a custom webhook that declares itself paid", () => {
  it("is attributed even though its source is a display name", () => {
    const [lead] = attribute([
      { leadId: "l1", source: "Google Ads", campaignId: "22334455", adPlatform: "google" },
    ]);

    expect(lead.platform).toBe("google");
    expect(lead.campaignId).toBe("22334455");
  });

  it("was invisible before, which is the bug", () => {
    // The same row without the declaration: exactly what Leon has today.
    const [lead] = attribute([{ leadId: "l1", source: "Google Ads", campaignId: "22334455" }]);

    expect(lead.platform).toBeNull();
    expect(lead.campaignId).toBeNull();
  });

  it("still needs a campaign id — a platform alone attributes nothing", () => {
    // Spend is joined on the campaign. Without one there is nothing to
    // join to, and counting the lead against the platform's total would
    // put it in a row no campaign owns.
    const [lead] = attribute([
      { leadId: "l1", source: "Google Ads", campaignId: null, adPlatform: "google" },
    ]);

    expect(lead.platform).toBeNull();
  });

  it("ignores a platform that is not one we hold spend for", () => {
    // Typed by hand into the database, or left over from a renamed
    // platform. Attributing it would create a row in the report whose
    // spend is permanently zero.
    const [lead] = attribute([
      { leadId: "l1", source: "Tiktok Ads", campaignId: "991", adPlatform: "tiktok" },
    ]);

    expect(lead.platform).toBeNull();
  });
});

describe("the built-in webhooks, unchanged", () => {
  it("still attributes on the source alone", () => {
    const rows = attribute([
      { leadId: "l1", source: "meta", campaignId: "111" },
      { leadId: "l2", source: "google", campaignId: "222" },
    ]);

    expect(rows[0].platform).toBe("meta");
    expect(rows[1].platform).toBe("google");
  });

  it("leaves an ordinary source alone", () => {
    const [lead] = attribute([{ leadId: "l1", source: "walk_in", campaignId: "333" }]);
    expect(lead.platform).toBeNull();
  });
});

describe("which enquiry decides", () => {
  /*
    CLAUDE.md: first-touch source is never overwritten. The campaign that
    *found* the person earned the admission, even if they later filled in
    a website form — and that has to hold for a declared platform too,
    or wiring up a paid feed would quietly re-attribute people it did not
    find.
  */
  it("keeps the first enquiry when a later one is paid", () => {
    const [lead] = attribute([
      { leadId: "l1", source: "google", campaignId: "111" },
      { leadId: "l1", source: "Google Ads", campaignId: "999", adPlatform: "google" },
    ]);

    expect(lead.campaignId).toBe("111");
  });

  it("skips an earlier enquiry that was not paid at all", () => {
    // "First one wins" means the first one that *can* win: a walk-in
    // carries no campaign, so the paid enquiry behind it is the one that
    // identifies the spend.
    const [lead] = attribute([
      { leadId: "l1", source: "walk_in", campaignId: null },
      { leadId: "l1", source: "Google Ads", campaignId: "22334455", adPlatform: "google" },
    ]);

    expect(lead.platform).toBe("google");
    expect(lead.campaignId).toBe("22334455");
  });
});
