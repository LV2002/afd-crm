/**
 * The arithmetic behind the ad-spend dashboard.
 *
 * This is money that decides a budget, so it gets worked examples rather
 * than the type system. Three things in particular are easy to get wrong
 * and expensive to get wrong quietly: a zero denominator rendering as
 * Infinity, a campaign that spent money and produced nothing being dropped
 * by an inner join, and a total that isn't the sum of the rows above it.
 *
 * All money is integer paise (CLAUDE.md § Non-negotiables: never floats).
 */
import { describe, expect, it } from "vitest";

import {
  attributeLeads,
  combinePerformance,
  formatMultiple,
  formatPercent,
  performanceTotals,
  rollUpSpend,
  type AttributedLead,
  type SpendRow,
} from "../src/lib/reports/ad-performance";

const RUPEE = 100;

function spend(overrides: Partial<SpendRow> = {}): SpendRow {
  return {
    platform: "meta",
    campaignId: "c1",
    campaignName: "NIFT Foundation",
    spendPaise: 1000 * RUPEE,
    impressions: 10_000,
    clicks: 200,
    ...overrides,
  };
}

function lead(overrides: Partial<AttributedLead> = {}): AttributedLead {
  return {
    leadId: crypto.randomUUID(),
    platform: "meta",
    campaignId: "c1",
    isAdmission: false,
    netFeePaise: 0,
    collectedPaise: 0,
    ...overrides,
  };
}

describe("rollUpSpend", () => {
  it("sums the per-ad rows into one row per campaign", () => {
    // Meta writes one row per ad per night, so a campaign with three
    // creatives running for two nights is six rows.
    const rolled = rollUpSpend([
      spend({ spendPaise: 500 * RUPEE, impressions: 5_000, clicks: 100 }),
      spend({ spendPaise: 300 * RUPEE, impressions: 3_000, clicks: 60 }),
      spend({ spendPaise: 200 * RUPEE, impressions: 2_000, clicks: 40 }),
    ]);

    expect(rolled.size).toBe(1);
    const row = rolled.get("meta:c1")!;
    expect(row.spendPaise).toBe(1000 * RUPEE);
    expect(row.impressions).toBe(10_000);
    expect(row.clicks).toBe(200);
  });

  it("keeps the same campaign id on two platforms apart", () => {
    // Campaign ids are only unique within a platform, so keying on the id
    // alone would silently merge a Meta campaign with a Google one.
    const rolled = rollUpSpend([
      spend({ platform: "meta", campaignId: "123", spendPaise: 100 * RUPEE }),
      spend({ platform: "google", campaignId: "123", spendPaise: 400 * RUPEE }),
    ]);

    expect(rolled.size).toBe(2);
    expect(rolled.get("meta:123")!.spendPaise).toBe(100 * RUPEE);
    expect(rolled.get("google:123")!.spendPaise).toBe(400 * RUPEE);
  });

  it("takes the campaign name from whichever row has one", () => {
    // Both platforms occasionally return a null name on a row; one blank
    // row must not rename the campaign to nothing.
    const rolled = rollUpSpend([
      spend({ campaignName: null }),
      spend({ campaignName: "NIFT Foundation" }),
    ]);
    expect(rolled.get("meta:c1")!.campaignName).toBe("NIFT Foundation");
  });
});

describe("combinePerformance", () => {
  it("works a whole campaign through end to end", () => {
    // ₹10,000 spent, 20 leads, 2 of them enrolled at ₹45,000 each.
    const rows = combinePerformance(
      [spend({ spendPaise: 10_000 * RUPEE })],
      [
        ...Array.from({ length: 18 }, () => lead()),
        lead({ isAdmission: true, netFeePaise: 45_000 * RUPEE, collectedPaise: 20_000 * RUPEE }),
        lead({ isAdmission: true, netFeePaise: 45_000 * RUPEE, collectedPaise: 45_000 * RUPEE }),
      ],
    );

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.leads).toBe(20);
    expect(row.admissions).toBe(2);
    expect(row.costPerLeadPaise).toBe(500 * RUPEE); // 10,000 / 20
    expect(row.costPerAdmissionPaise).toBe(5_000 * RUPEE); // 10,000 / 2
    expect(row.bookedPaise).toBe(90_000 * RUPEE);
    expect(row.collectedPaise).toBe(65_000 * RUPEE);
    expect(row.roas).toBe(9); // 90,000 booked on 10,000 spent
    expect(row.conversionRate).toBe(0.1);
  });

  it("keeps a campaign that spent money and produced nothing", () => {
    // The single most useful row on the page. An inner join between spend
    // and leads would hide exactly this one.
    const rows = combinePerformance([spend({ spendPaise: 8_000 * RUPEE })], []);
    expect(rows).toHaveLength(1);
    expect(rows[0].leads).toBe(0);
    expect(rows[0].spendPaise).toBe(8_000 * RUPEE);
    // Not Infinity, and not zero either — zero would read as "free".
    expect(rows[0].costPerLeadPaise).toBeNull();
    expect(rows[0].costPerAdmissionPaise).toBeNull();
  });

  it("keeps leads whose campaign has no spend rows yet", () => {
    // Usually means the spend sync hasn't run for that account. Dropping
    // them would make this page's lead count disagree with Insights.
    const rows = combinePerformance([], [lead(), lead()]);
    expect(rows).toHaveLength(1);
    expect(rows[0].leads).toBe(2);
    expect(rows[0].spendPaise).toBe(0);
    expect(rows[0].roas).toBeNull();
  });

  it("ignores leads that did not come from an ad at all", () => {
    // A walk-in has no campaign. Averaging it into a campaign's numbers
    // would make paid advertising look better than it is.
    const rows = combinePerformance(
      [spend({ spendPaise: 1_000 * RUPEE })],
      [
        lead(),
        lead({ platform: null, campaignId: null }),
        lead({ platform: null, campaignId: null, isAdmission: true, netFeePaise: 50_000 * RUPEE }),
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].leads).toBe(1);
    expect(rows[0].admissions).toBe(0);
    expect(rows[0].bookedPaise).toBe(0);
  });

  it("counts fees only for leads that actually enrolled", () => {
    // A lead carrying a net fee but not marked as an admission is a fee
    // plan on an unconfirmed enrolment; counting it would book revenue
    // that nobody has agreed to.
    const rows = combinePerformance(
      [spend()],
      [lead({ isAdmission: false, netFeePaise: 50_000 * RUPEE, collectedPaise: 5_000 * RUPEE })],
    );
    expect(rows[0].admissions).toBe(0);
    expect(rows[0].bookedPaise).toBe(0);
    expect(rows[0].collectedPaise).toBe(0);
  });

  it("puts the biggest spender first", () => {
    const rows = combinePerformance(
      [
        spend({ campaignId: "small", spendPaise: 100 * RUPEE }),
        spend({ campaignId: "big", spendPaise: 90_000 * RUPEE }),
        spend({ campaignId: "medium", spendPaise: 4_000 * RUPEE }),
      ],
      [],
    );
    expect(rows.map((r) => r.campaignId)).toEqual(["big", "medium", "small"]);
  });

  it("falls back to the campaign id when the platform gave no name", () => {
    const rows = combinePerformance([spend({ campaignName: null, campaignId: "238471" })], []);
    expect(rows[0].campaignName).toBe("238471");
  });
});

describe("performanceTotals", () => {
  it("is the sum of the rows above it, not a separate calculation", () => {
    // A table whose total disagrees with its own column is the fastest
    // way to lose somebody's trust in a report.
    const rows = combinePerformance(
      [
        spend({ campaignId: "a", spendPaise: 10_000 * RUPEE }),
        spend({ campaignId: "b", spendPaise: 30_000 * RUPEE }),
      ],
      [
        lead({ campaignId: "a" }),
        lead({ campaignId: "a", isAdmission: true, netFeePaise: 40_000 * RUPEE, collectedPaise: 10_000 * RUPEE }),
        lead({ campaignId: "b" }),
        lead({ campaignId: "b" }),
        lead({ campaignId: "b", isAdmission: true, netFeePaise: 60_000 * RUPEE, collectedPaise: 60_000 * RUPEE }),
      ],
    );
    const totals = performanceTotals(rows);

    expect(totals.spendPaise).toBe(rows.reduce((s, r) => s + r.spendPaise, 0));
    expect(totals.leads).toBe(5);
    expect(totals.admissions).toBe(2);
    expect(totals.bookedPaise).toBe(100_000 * RUPEE);
    expect(totals.collectedPaise).toBe(70_000 * RUPEE);
  });

  it("computes cost per admission and LTV:CAC from the pooled figures", () => {
    // ₹40,000 spent, 2 admissions worth ₹50,000 each:
    //   CAC = 40,000 / 2 = 20,000
    //   LTV = 100,000 / 2 = 50,000
    //   LTV:CAC = 2.5
    const rows = combinePerformance(
      [spend({ spendPaise: 40_000 * RUPEE })],
      [
        lead({ isAdmission: true, netFeePaise: 50_000 * RUPEE }),
        lead({ isAdmission: true, netFeePaise: 50_000 * RUPEE }),
      ],
    );
    const totals = performanceTotals(rows);

    expect(totals.costPerAdmissionPaise).toBe(20_000 * RUPEE);
    expect(totals.averageAdmissionValuePaise).toBe(50_000 * RUPEE);
    expect(totals.ltvToCac).toBe(2.5);
    expect(totals.roas).toBe(2.5);
  });

  it("returns nulls rather than Infinity or NaN when nothing has happened", () => {
    // An empty month must render as dashes, not as "₹Infinity" or "NaN×",
    // both of which make the whole screen look broken.
    const totals = performanceTotals([]);
    expect(totals.costPerLeadPaise).toBeNull();
    expect(totals.costPerAdmissionPaise).toBeNull();
    expect(totals.roas).toBeNull();
    expect(totals.conversionRate).toBeNull();
    expect(totals.ltvToCac).toBeNull();
    expect(totals.spendPaise).toBe(0);
  });

  it("reports spend with no admissions as an unanswerable ratio, not a zero", () => {
    const rows = combinePerformance([spend({ spendPaise: 5_000 * RUPEE })], [lead(), lead()]);
    const totals = performanceTotals(rows);
    expect(totals.costPerLeadPaise).toBe(2_500 * RUPEE);
    expect(totals.costPerAdmissionPaise).toBeNull();
    expect(totals.ltvToCac).toBeNull();
    // ROAS is genuinely zero here: money went out, none was booked.
    expect(totals.roas).toBe(0);
  });
});

describe("formatting", () => {
  it("prints a dash for a ratio that could not be worked out", () => {
    expect(formatMultiple(null)).toBe("—");
    expect(formatPercent(null)).toBe("—");
  });

  it("prints multiples and percentages the way a person reads them", () => {
    expect(formatMultiple(9)).toBe("9.0×");
    expect(formatMultiple(2.54)).toBe("2.5×");
    expect(formatPercent(0.1)).toBe("10.0%");
    expect(formatPercent(0)).toBe("0.0%");
  });
});

/**
 * Turning four query results into one row per lead. Every assertion here
 * is a rule that changes a number on the budget screen, and every one of
 * them is easy to get subtly wrong in a way nobody would notice.
 */
describe("attributeLeads", () => {
  it("takes the campaign from the FIRST enquiry, not the most recent", () => {
    // CLAUDE.md: first-touch source is never overwritten. Somebody who
    // came from a Meta ad and later filled in the website form is still
    // the Meta campaign's admission — it found them.
    const [attributed] = attributeLeads({
      leadIds: ["lead-1"],
      enquiryRows: [
        { leadId: "lead-1", source: "meta", campaignId: "c-meta" },
        { leadId: "lead-1", source: "google", campaignId: "c-google" },
      ],
      enrolmentRows: [],
      paymentRows: [],
    });
    expect(attributed.campaignId).toBe("c-meta");
    expect(attributed.platform).toBe("meta");
  });

  it("skips a website enquiry to find the ad that actually brought them", () => {
    // The first enquiry chronologically may be a source with no campaign
    // at all. Stopping at it would lose the attribution entirely.
    const [attributed] = attributeLeads({
      leadIds: ["lead-1"],
      enquiryRows: [
        { leadId: "lead-1", source: "Website", campaignId: null },
        { leadId: "lead-1", source: "meta", campaignId: "c-meta" },
      ],
      enrolmentRows: [],
      paymentRows: [],
    });
    expect(attributed.campaignId).toBe("c-meta");
  });

  it("attributes nothing to a lead that never came from an ad", () => {
    const [attributed] = attributeLeads({
      leadIds: ["lead-1"],
      enquiryRows: [{ leadId: "lead-1", source: "Walk-in", campaignId: null }],
      enrolmentRows: [],
      paymentRows: [],
    });
    expect(attributed.platform).toBeNull();
    expect(attributed.campaignId).toBeNull();
  });

  it("ignores a campaign id on a source that is not a paid platform", () => {
    // Only 'meta' and 'google' exist in ad_spend_daily, so a campaign id
    // under any other source can never join to spend — treating it as one
    // would invent a campaign row with cost per lead of nothing.
    const [attributed] = attributeLeads({
      leadIds: ["lead-1"],
      enquiryRows: [{ leadId: "lead-1", source: "CSV Import", campaignId: "c-99" }],
      enrolmentRows: [],
      paymentRows: [],
    });
    expect(attributed.campaignId).toBeNull();
  });

  it("includes every lead in the period, ad-sourced or not", () => {
    // The page reports organic leads alongside paid ones, so a lead with
    // no enquiry rows at all must still come back.
    const attributed = attributeLeads({
      leadIds: ["a", "b", "c"],
      enquiryRows: [{ leadId: "a", source: "meta", campaignId: "c1" }],
      enrolmentRows: [],
      paymentRows: [],
    });
    expect(attributed).toHaveLength(3);
    expect(attributed.filter((l) => l.campaignId === null)).toHaveLength(2);
  });

  it("nets a refund off what was collected", () => {
    // A debit is a reversal. Counting it as income would show money the
    // institute gave back as return on ad spend.
    const [attributed] = attributeLeads({
      leadIds: ["lead-1"],
      enquiryRows: [{ leadId: "lead-1", source: "meta", campaignId: "c1" }],
      enrolmentRows: [{ id: "e1", leadId: "lead-1", netFeePaise: 50_000 * RUPEE }],
      paymentRows: [
        { enrolmentId: "e1", amountPaise: 30_000 * RUPEE, direction: "credit" },
        { enrolmentId: "e1", amountPaise: 10_000 * RUPEE, direction: "debit" },
      ],
    });
    expect(attributed.collectedPaise).toBe(20_000 * RUPEE);
  });

  it("counts a lead who enrolled twice as one admission worth both fees", () => {
    // Somebody who came back the next year. Two admissions here would
    // flatter every conversion rate on the page.
    const [attributed] = attributeLeads({
      leadIds: ["lead-1"],
      enquiryRows: [{ leadId: "lead-1", source: "meta", campaignId: "c1" }],
      enrolmentRows: [
        { id: "e1", leadId: "lead-1", netFeePaise: 40_000 * RUPEE },
        { id: "e2", leadId: "lead-1", netFeePaise: 60_000 * RUPEE },
      ],
      paymentRows: [
        { enrolmentId: "e1", amountPaise: 40_000 * RUPEE, direction: "credit" },
        { enrolmentId: "e2", amountPaise: 15_000 * RUPEE, direction: "credit" },
      ],
    });
    expect(attributed.isAdmission).toBe(true);
    expect(attributed.netFeePaise).toBe(100_000 * RUPEE);
    expect(attributed.collectedPaise).toBe(55_000 * RUPEE);

    const rows = combinePerformance([spend()], [attributed]);
    expect(rows[0].admissions).toBe(1);
    expect(rows[0].conversionRate).toBe(1);
  });

  it("is not an admission when the caller passed no enrolment for it", () => {
    // The page's query already excludes enrolments before the gate and
    // dropped ones, so absence here IS the rule "not an admission".
    const [attributed] = attributeLeads({
      leadIds: ["lead-1"],
      enquiryRows: [{ leadId: "lead-1", source: "meta", campaignId: "c1" }],
      enrolmentRows: [],
      paymentRows: [],
    });
    expect(attributed.isAdmission).toBe(false);
    expect(attributed.netFeePaise).toBe(0);
    expect(attributed.collectedPaise).toBe(0);
  });

  it("leaves an admission with no payments yet at zero collected", () => {
    const [attributed] = attributeLeads({
      leadIds: ["lead-1"],
      enquiryRows: [{ leadId: "lead-1", source: "google", campaignId: "g1" }],
      enrolmentRows: [{ id: "e1", leadId: "lead-1", netFeePaise: 70_000 * RUPEE }],
      paymentRows: [],
    });
    expect(attributed.isAdmission).toBe(true);
    expect(attributed.netFeePaise).toBe(70_000 * RUPEE);
    expect(attributed.collectedPaise).toBe(0);
  });
});
