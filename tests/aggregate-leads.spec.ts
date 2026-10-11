import { describe, expect, it } from "vitest";

import {
  aggregateCentrePerformance,
  aggregateByStatus,
  aggregateLeadsBySource,
  aggregateScorecard,
  type ReportLead,
  type StatusInfo,
} from "../src/lib/reports/aggregate-leads";

function lead(overrides: Partial<ReportLead> & Pick<ReportLead, "id">): ReportLead {
  return { assignedTo: null, centerId: null, temperature: null, firstTouchSource: null, ...overrides };
}

const STATUSES: StatusInfo[] = [
  { value: "not_contacted", label: "Not contacted", rank: 1, kind: "new" },
  { value: "hot", label: "Hot", rank: 5, kind: "open" },
  { value: "took_admission", label: "Took admission", rank: 6, kind: "won" },
  { value: "negative", label: "Negative", rank: 8, kind: "lost" },
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

describe("aggregateByStatus", () => {
  it("includes every status in rank order, even with zero leads", () => {
    const leads = [lead({ id: "1", temperature: "hot" })];
    const result = aggregateByStatus(leads, [...STATUSES].reverse());
    expect(result.map((r) => r.name)).toEqual(["Not contacted", "Hot", "Took admission", "Negative"]);
    expect(result.find((r) => r.name === "Hot")?.count).toBe(1);
    expect(result.find((r) => r.name === "Not contacted")?.count).toBe(0);
  });

  it("ignores a lead with no temperature at all", () => {
    const leads = [lead({ id: "1", temperature: null })];
    const result = aggregateByStatus(leads, STATUSES);
    expect(result.every((r) => r.count === 0)).toBe(true);
  });

  it("carries each status's kind through, so a chart can treat a closed one differently", () => {
    const result = aggregateByStatus([], STATUSES);
    expect(result.map((r) => r.kind)).toEqual(["new", "open", "won", "lost"]);
  });
});

describe("aggregateScorecard", () => {
  const names = new Map([["u1", "Athira"], ["u2", "Divya"]]);

  it("counts total/won/lost per owner, sorted by total descending", () => {
    const leads = [
      lead({ id: "1", assignedTo: "u1", temperature: "took_admission" }),
      lead({ id: "2", assignedTo: "u1", temperature: "not_contacted" }),
      lead({ id: "3", assignedTo: "u2", temperature: "negative" }),
    ];
    const result = aggregateScorecard(leads, STATUSES, names);
    expect(result).toEqual([
      { ownerId: "u1", name: "Athira", total: 2, won: 1, lost: 0 },
      { ownerId: "u2", name: "Divya", total: 1, won: 0, lost: 1 },
    ]);
  });

  it("excludes unassigned leads — there's no counsellor to score", () => {
    const leads = [lead({ id: "1", assignedTo: null })];
    expect(aggregateScorecard(leads, STATUSES, names)).toEqual([]);
  });
});

describe("aggregateCentrePerformance", () => {
  const names = new Map([["kochi", "Kochi"], ["kannur", "Kannur"]]);

  it("counts total/won/lost per centre", () => {
    const leads = [
      lead({ id: "1", centerId: "kochi", temperature: "took_admission" }),
      lead({ id: "2", centerId: "kochi", temperature: "not_contacted" }),
      lead({ id: "3", centerId: "kannur", temperature: "negative" }),
    ];
    expect(aggregateCentrePerformance(leads, STATUSES, names)).toEqual([
      { centerId: "kochi", name: "Kochi", total: 2, won: 1, lost: 0 },
      { centerId: "kannur", name: "Kannur", total: 1, won: 0, lost: 1 },
    ]);
  });

  it("excludes leads with no centre", () => {
    const leads = [lead({ id: "1", centerId: null })];
    expect(aggregateCentrePerformance(leads, STATUSES, names)).toEqual([]);
  });
});
