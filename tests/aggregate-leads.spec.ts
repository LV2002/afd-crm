import { describe, expect, it } from "vitest";

import {
  aggregateCentrePerformance,
  aggregateFunnel,
  aggregateLeadsBySource,
  aggregateScorecard,
  type ReportLead,
  type StageInfo,
} from "../src/lib/reports/aggregate-leads";

function lead(overrides: Partial<ReportLead> & Pick<ReportLead, "id">): ReportLead {
  return { assignedTo: null, centerId: null, stageId: null, firstTouchSource: null, ...overrides };
}

const STAGES: StageInfo[] = [
  { id: "new", name: "New", sortOrder: 0, stageType: "new" },
  { id: "qualified", name: "Qualified", sortOrder: 1, stageType: "normal" },
  { id: "won", name: "Enrolled", sortOrder: 2, stageType: "won" },
  { id: "lost", name: "Lost", sortOrder: 3, stageType: "lost" },
];

describe("aggregateLeadsBySource", () => {
  it("counts by first-touch source, most first", () => {
    const leads = [
      lead({ id: "1", firstTouchSource: "Meta" }),
      lead({ id: "2", firstTouchSource: "Meta" }),
      lead({ id: "3", firstTouchSource: "Website" }),
    ];
    expect(aggregateLeadsBySource(leads)).toEqual([
      { source: "Meta", count: 2 },
      { source: "Website", count: 1 },
    ]);
  });

  it("buckets a missing source as Unknown rather than dropping the lead", () => {
    const leads = [lead({ id: "1", firstTouchSource: null })];
    expect(aggregateLeadsBySource(leads)).toEqual([{ source: "Unknown", count: 1 }]);
  });
});

describe("aggregateFunnel", () => {
  it("includes every stage in sort order, even with zero leads", () => {
    const leads = [lead({ id: "1", stageId: "qualified" })];
    const result = aggregateFunnel(leads, STAGES);
    expect(result.map((r) => r.name)).toEqual(["New", "Qualified", "Enrolled", "Lost"]);
    expect(result.find((r) => r.name === "Qualified")?.count).toBe(1);
    expect(result.find((r) => r.name === "New")?.count).toBe(0);
  });

  it("ignores a lead with no stage at all", () => {
    const leads = [lead({ id: "1", stageId: null })];
    const result = aggregateFunnel(leads, STAGES);
    expect(result.every((r) => r.count === 0)).toBe(true);
  });
});

describe("aggregateScorecard", () => {
  const names = new Map([["u1", "Athira"], ["u2", "Divya"]]);

  it("counts total/won/lost per owner, sorted by total descending", () => {
    const leads = [
      lead({ id: "1", assignedTo: "u1", stageId: "won" }),
      lead({ id: "2", assignedTo: "u1", stageId: "new" }),
      lead({ id: "3", assignedTo: "u2", stageId: "lost" }),
    ];
    const result = aggregateScorecard(leads, STAGES, names);
    expect(result).toEqual([
      { ownerId: "u1", name: "Athira", total: 2, won: 1, lost: 0 },
      { ownerId: "u2", name: "Divya", total: 1, won: 0, lost: 1 },
    ]);
  });

  it("excludes unassigned leads — there's no counsellor to score", () => {
    const leads = [lead({ id: "1", assignedTo: null })];
    expect(aggregateScorecard(leads, STAGES, names)).toEqual([]);
  });
});

describe("aggregateCentrePerformance", () => {
  const names = new Map([["kochi", "Kochi"], ["kannur", "Kannur"]]);

  it("counts total/won/lost per centre", () => {
    const leads = [
      lead({ id: "1", centerId: "kochi", stageId: "won" }),
      lead({ id: "2", centerId: "kochi", stageId: "new" }),
      lead({ id: "3", centerId: "kannur", stageId: "lost" }),
    ];
    expect(aggregateCentrePerformance(leads, STAGES, names)).toEqual([
      { centerId: "kochi", name: "Kochi", total: 2, won: 1, lost: 0 },
      { centerId: "kannur", name: "Kannur", total: 1, won: 0, lost: 1 },
    ]);
  });

  it("excludes leads with no centre", () => {
    const leads = [lead({ id: "1", centerId: null })];
    expect(aggregateCentrePerformance(leads, STAGES, names)).toEqual([]);
  });
});
