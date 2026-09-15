import { describe, expect, it } from "vitest";

import {
  referralsByMonth,
  secondGenerationCount,
  summariseReferrals,
  topReferrers,
  type ReferralRow,
} from "@/lib/reports/referrals";

function row(over: Partial<ReferralRow> & { leadId: string }): ReferralRow {
  return {
    referredByLeadId: null,
    admitted: false,
    arrivedOn: "2026-03-04",
    ...over,
  };
}

describe("summariseReferrals", () => {
  it("counts referred leads and their share", () => {
    const summary = summariseReferrals([
      row({ leadId: "a", referredByLeadId: "r1" }),
      row({ leadId: "b", referredByLeadId: "r1" }),
      row({ leadId: "c" }),
      row({ leadId: "d" }),
    ]);

    expect(summary.totalLeads).toBe(4);
    expect(summary.referredLeads).toBe(2);
    expect(summary.referredShare).toBe(0.5);
    expect(summary.referrerCount).toBe(1);
  });

  it("compares conversion of referred leads against everybody else", () => {
    const summary = summariseReferrals([
      row({ leadId: "a", referredByLeadId: "r1", admitted: true }),
      row({ leadId: "b", referredByLeadId: "r2", admitted: true }),
      row({ leadId: "c", referredByLeadId: "r2" }),
      row({ leadId: "d", admitted: true }),
      row({ leadId: "e" }),
      row({ leadId: "f" }),
      row({ leadId: "g" }),
    ]);

    expect(summary.referredAdmissions).toBe(2);
    expect(summary.otherAdmissions).toBe(1);
    expect(summary.referredConversion).toBeCloseTo(2 / 3);
    expect(summary.otherConversion).toBe(0.25);
    // 66.7% - 25% ≈ 41.7 points
    expect(summary.conversionLiftPoints).toBeCloseTo(41.7, 1);
  });

  it("reports a negative lift when referrals convert worse", () => {
    const summary = summariseReferrals([
      row({ leadId: "a", referredByLeadId: "r1" }),
      row({ leadId: "b", referredByLeadId: "r1" }),
      row({ leadId: "c", admitted: true }),
      row({ leadId: "d", admitted: true }),
    ]);

    expect(summary.conversionLiftPoints).toBe(-100);
  });

  it("never divides by zero on an empty or all-referred set", () => {
    expect(summariseReferrals([])).toMatchObject({
      totalLeads: 0,
      referredShare: 0,
      referredConversion: 0,
      otherConversion: 0,
      conversionLiftPoints: 0,
    });

    const allReferred = summariseReferrals([
      row({ leadId: "a", referredByLeadId: "r1", admitted: true }),
    ]);
    expect(allReferred.otherConversion).toBe(0);
    expect(allReferred.referredConversion).toBe(1);
  });
});

describe("topReferrers", () => {
  const rows = [
    row({ leadId: "a", referredByLeadId: "quiet", admitted: true, arrivedOn: "2026-01-10" }),
    row({ leadId: "b", referredByLeadId: "quiet", admitted: true, arrivedOn: "2026-02-10" }),
    row({ leadId: "c", referredByLeadId: "loud", arrivedOn: "2026-03-10" }),
    row({ leadId: "d", referredByLeadId: "loud", arrivedOn: "2026-04-10" }),
    row({ leadId: "e", referredByLeadId: "loud", arrivedOn: "2026-05-10" }),
    row({ leadId: "f" }),
  ];

  it("ranks by admissions before volume", () => {
    const standings = topReferrers(rows);
    expect(standings.map((s) => s.referrerId)).toEqual(["quiet", "loud"]);
    expect(standings[0]).toMatchObject({ referrals: 2, admissions: 2, conversion: 1 });
    expect(standings[1]).toMatchObject({ referrals: 3, admissions: 0, conversion: 0 });
  });

  it("records the most recent referral date per referrer", () => {
    const standings = topReferrers(rows);
    expect(standings[0].lastReferralOn).toBe("2026-02-10");
    expect(standings[1].lastReferralOn).toBe("2026-05-10");
  });

  it("ignores leads with no referrer and honours the limit", () => {
    expect(topReferrers(rows, 1)).toHaveLength(1);
    expect(topReferrers([row({ leadId: "a" })])).toEqual([]);
  });
});

describe("referralsByMonth", () => {
  it("buckets by the arrival month in order, skipping empty months", () => {
    const months = referralsByMonth([
      row({ leadId: "a", arrivedOn: "2026-03-31", referredByLeadId: "r1", admitted: true }),
      row({ leadId: "b", arrivedOn: "2026-03-01" }),
      row({ leadId: "c", arrivedOn: "2026-01-15", referredByLeadId: "r1" }),
    ]);

    expect(months.map((m) => m.month)).toEqual(["2026-01", "2026-03"]);
    expect(months[1]).toMatchObject({
      leads: 2,
      referred: 1,
      referredShare: 0.5,
      referredAdmissions: 1,
    });
  });
});

describe("secondGenerationCount", () => {
  it("counts referrals made by somebody who was themselves referred", () => {
    const rows = [
      row({ leadId: "founder-referral", referredByLeadId: "old-student" }),
      // Referred BY the lead who was referred above — second generation.
      row({ leadId: "grandchild", referredByLeadId: "founder-referral" }),
      row({ leadId: "cold", referredByLeadId: "old-student" }),
    ];
    expect(secondGenerationCount(rows)).toBe(1);
  });

  it("is zero when the chain never goes past one hop", () => {
    expect(
      secondGenerationCount([
        row({ leadId: "a", referredByLeadId: "x" }),
        row({ leadId: "b", referredByLeadId: "y" }),
      ]),
    ).toBe(0);
  });
});
