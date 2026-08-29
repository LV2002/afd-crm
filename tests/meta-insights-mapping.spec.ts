import { describe, expect, it } from "vitest";

import { mapMetaInsightsRow, type MetaInsightsRow } from "../src/lib/integrations/meta/insights-client";
import { yesterdayDateStringIST } from "../src/lib/format/date";

describe("mapMetaInsightsRow", () => {
  const base: MetaInsightsRow = {
    campaign_id: "c1",
    campaign_name: "Foundation Kochi",
    adset_id: "as1",
    adset_name: "18-24 Kerala",
    ad_id: "ad1",
    ad_name: "Creative A",
    spend: "1234.56",
    impressions: "10000",
    clicks: "250",
  };

  it("converts decimal rupee spend to whole paise", () => {
    expect(mapMetaInsightsRow(base).spendPaise).toBe(123456);
  });

  it("rounds away float artifacts instead of truncating", () => {
    const row = { ...base, spend: "10.1" }; // 10.1 * 100 in raw JS float math is 1009.9999999999999
    expect(mapMetaInsightsRow(row).spendPaise).toBe(1010);
  });

  it("treats a missing spend/impressions/clicks as zero rather than NaN", () => {
    const row: MetaInsightsRow = { campaign_id: "c1", ad_id: "ad1", spend: "" };
    const mapped = mapMetaInsightsRow(row);
    expect(mapped.spendPaise).toBe(0);
    expect(mapped.impressions).toBe(0);
    expect(mapped.clicks).toBe(0);
    expect(mapped.leadsReported).toBe(0);
  });

  it("sums only lead-shaped actions, ignoring unrelated ones", () => {
    const row: MetaInsightsRow = {
      ...base,
      actions: [
        { action_type: "lead", value: "3" },
        { action_type: "onsite_conversion.lead_grouped", value: "2" },
        { action_type: "link_click", value: "250" },
        { action_type: "post_engagement", value: "40" },
      ],
    };
    expect(mapMetaInsightsRow(row).leadsReported).toBe(5);
  });

  it("carries campaign/adset/ad names through untouched", () => {
    const mapped = mapMetaInsightsRow(base);
    expect(mapped.campaignId).toBe("c1");
    expect(mapped.campaignName).toBe("Foundation Kochi");
    expect(mapped.adsetId).toBe("as1");
    expect(mapped.adName).toBe("Creative A");
  });
});

describe("yesterdayDateStringIST", () => {
  it("returns the calendar date before today in IST, not UTC", () => {
    // 2024-03-02T01:00:00Z is 2024-03-02 06:30 IST -- "yesterday" is 03-01 either way here.
    expect(yesterdayDateStringIST(new Date("2024-03-02T01:00:00Z"))).toBe("2024-03-01");
  });

  it("crosses the IST day boundary correctly even when UTC hasn't yet", () => {
    // 2024-03-01T19:00:00Z is 2024-03-02 00:30 IST -- already "tomorrow" in IST while
    // still 2024-03-01 in UTC, so "yesterday" from this instant must be 03-01, not 02-28.
    expect(yesterdayDateStringIST(new Date("2024-03-01T19:00:00Z"))).toBe("2024-03-01");
  });
});
