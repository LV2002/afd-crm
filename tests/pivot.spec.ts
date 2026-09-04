import { describe, expect, it } from "vitest";

import {
  NOT_SET,
  applyPivotFilters,
  bucketLabel,
  bucketsFor,
  dimensionFields,
  groupLeads,
  isDimension,
  matchesFilter,
  oversubscribed,
  summarise,
  type PivotField,
  type PivotLead,
} from "@/lib/reports/pivot";

const field = (over: Partial<PivotField> & Pick<PivotField, "key" | "type">): PivotField => ({
  label: over.key,
  isCore: true,
  ...over,
});

const SOURCE = field({ key: "lead_source", type: "select", label: "Lead Source" });
const EXAMS = field({ key: "interested_exams", type: "multiselect", label: "Interested Exams" });
const CITY = field({ key: "city", type: "text", label: "City" });
const CREATED = field({ key: "created_at", type: "datetime", label: "Created (month)" });
const BROCHURE = field({ key: "brochure_sent", type: "boolean", label: "Brochure Sent" });

const STAGE_TYPES = new Map([
  ["stage-new", "new"],
  ["stage-won", "won"],
  ["stage-lost", "lost"],
]);

function lead(id: string, stageId: string | null, values: Record<string, unknown>): PivotLead {
  return { id, stageId, values };
}

describe("isDimension", () => {
  it("keeps the variables a breakdown is actually about", () => {
    expect(isDimension(SOURCE)).toBe(true);
    expect(isDimension(EXAMS)).toBe(true);
    expect(isDimension(CITY)).toBe(true);
    expect(isDimension(BROCHURE)).toBe(true);
    expect(isDimension(field({ key: "previous_attempts", type: "number" }))).toBe(true);
  });

  // The page reads over the direct Postgres connection, bypassing RLS, so
  // "what may be selected" is the whole of its PII guarantee.
  it("refuses contact details, files and free-text notes", () => {
    for (const type of ["phone", "email", "url", "file", "long_text", "currency", "lead_ref"] as const) {
      expect(isDimension(field({ key: `x_${type}`, type }))).toBe(false);
    }
  });

  it("refuses the fields whose value is the person, however they are typed", () => {
    expect(isDimension(field({ key: "student_name", type: "text" }))).toBe(false);
    expect(isDimension(field({ key: "father_name", type: "text" }))).toBe(false);
    expect(isDimension(field({ key: "mother_name", type: "text" }))).toBe(false);
    expect(isDimension(field({ key: "address_line", type: "text" }))).toBe(false);
  });

  it("filters a whole schema in one call", () => {
    const kept = dimensionFields([SOURCE, field({ key: "primary_phone", type: "phone" }), CITY]);
    expect(kept.map((f) => f.key)).toEqual(["lead_source", "city"]);
  });
});

describe("bucketsFor", () => {
  it("treats null, undefined and blank alike as not-set", () => {
    expect(bucketsFor(SOURCE, null)).toEqual([]);
    expect(bucketsFor(SOURCE, undefined)).toEqual([]);
    expect(bucketsFor(SOURCE, "   ")).toEqual([]);
    expect(bucketsFor(EXAMS, [])).toEqual([]);
  });

  it("puts a multi-value lead in every bucket it belongs to", () => {
    expect(bucketsFor(EXAMS, ["NID", "NIFT UG"])).toEqual(["NID", "NIFT UG"]);
  });

  it("drops blank entries inside an array rather than making an empty bucket", () => {
    expect(bucketsFor(EXAMS, ["NID", "", "  "])).toEqual(["NID"]);
  });

  it("buckets dates by month, from either a Date or an ISO string", () => {
    expect(bucketsFor(CREATED, new Date("2026-09-04T11:00:00Z"))).toEqual(["2026-09"]);
    expect(bucketsFor(CREATED, "2026-01-31T18:30:00.000Z")).toEqual(["2026-01"]);
  });

  it("ignores a date it cannot read rather than inventing a month", () => {
    expect(bucketsFor(CREATED, "not a date")).toEqual([]);
  });

  it("keeps booleans distinguishable from the strings that look like them", () => {
    expect(bucketsFor(BROCHURE, true)).toEqual(["true"]);
    expect(bucketsFor(BROCHURE, false)).toEqual(["false"]);
  });
});

describe("bucketLabel", () => {
  it("resolves an id through the option list", () => {
    const labels = new Map([["uuid-1", "Kochi"]]);
    expect(bucketLabel(field({ key: "center_id", type: "select" }), "uuid-1", labels)).toBe("Kochi");
  });

  it("falls back to the raw value rather than to a blank", () => {
    expect(bucketLabel(SOURCE, "Walk-in", new Map())).toBe("Walk-in");
  });

  it("reads booleans and months the way a person would", () => {
    expect(bucketLabel(BROCHURE, "true", new Map())).toBe("Yes");
    expect(bucketLabel(BROCHURE, "false", new Map())).toBe("No");
    expect(bucketLabel(CREATED, "2026-09", new Map())).toBe("Sep 2026");
    expect(bucketLabel(SOURCE, NOT_SET, new Map())).toBe("Not set");
  });
});

describe("matchesFilter", () => {
  it("passes everything when nothing is filtered", () => {
    expect(matchesFilter(SOURCE, "Meta", "")).toBe(true);
    expect(matchesFilter(SOURCE, null, "   ")).toBe(true);
  });

  it("matches a select exactly", () => {
    expect(matchesFilter(SOURCE, "Meta", "Meta")).toBe(true);
    expect(matchesFilter(SOURCE, "Meta", "Google")).toBe(false);
  });

  it("matches a multiselect if the lead holds the value at all", () => {
    expect(matchesFilter(EXAMS, ["NID", "UCEED"], "UCEED")).toBe(true);
    expect(matchesFilter(EXAMS, ["NID"], "UCEED")).toBe(false);
  });

  it("matches free text on a substring, case-insensitively", () => {
    expect(matchesFilter(CITY, "Ernakulam", "kula")).toBe(true);
    expect(matchesFilter(CITY, "Ernakulam", "KULA")).toBe(true);
    expect(matchesFilter(CITY, "Ernakulam", "Kannur")).toBe(false);
  });

  it("makes empty an answer you can ask for", () => {
    expect(matchesFilter(SOURCE, null, NOT_SET)).toBe(true);
    expect(matchesFilter(SOURCE, "Meta", NOT_SET)).toBe(false);
  });

  // The filter and the chart must agree about what "September" is, so both
  // go through bucketsFor().
  it("filters a date by the same month bucket the breakdown draws", () => {
    expect(matchesFilter(CREATED, "2026-09-04T11:00:00Z", "2026-09")).toBe(true);
    expect(matchesFilter(CREATED, "2026-08-31T11:00:00Z", "2026-09")).toBe(false);
  });
});

describe("applyPivotFilters", () => {
  const leads = [
    lead("a", "stage-won", { lead_source: "Meta", city: "Kochi" }),
    lead("b", "stage-new", { lead_source: "Meta", city: "Kannur" }),
    lead("c", "stage-new", { lead_source: "Walk-in", city: "Kochi" }),
  ];

  it("returns the set untouched when no filter is set", () => {
    expect(applyPivotFilters(leads, [SOURCE, CITY], {})).toHaveLength(3);
    expect(applyPivotFilters(leads, [SOURCE, CITY], { lead_source: "  " })).toHaveLength(3);
  });

  it("ANDs the filters together", () => {
    const result = applyPivotFilters(leads, [SOURCE, CITY], {
      lead_source: "Meta",
      city: "Kochi",
    });
    expect(result.map((l) => l.id)).toEqual(["a"]);
  });

  it("ignores a filter on a variable that isn't in play", () => {
    expect(applyPivotFilters(leads, [SOURCE], { city: "Kochi" })).toHaveLength(3);
  });
});

describe("summarise", () => {
  it("counts won and lost off the stage's type, not its name", () => {
    const leads = [
      lead("a", "stage-won", {}),
      lead("b", "stage-lost", {}),
      lead("c", "stage-new", {}),
      lead("d", null, {}),
    ];
    expect(summarise(leads, STAGE_TYPES)).toEqual({ total: 4, won: 1, lost: 1, dropped: 0 });
  });
});

describe("groupLeads", () => {
  const leads = [
    lead("a", "stage-won", { lead_source: "Meta" }),
    lead("b", "stage-new", { lead_source: "Meta" }),
    lead("c", "stage-lost", { lead_source: "Walk-in" }),
    lead("d", "stage-new", { lead_source: null }),
  ];

  it("counts, and carries won/lost into each row", () => {
    const rows = groupLeads(leads, SOURCE, STAGE_TYPES, new Map());
    expect(rows.map((r) => [r.label, r.total, r.won, r.lost])).toEqual([
      ["Meta", 2, 1, 0],
      ["Walk-in", 1, 0, 1],
      ["Not set", 1, 0, 0],
    ]);
  });

  // "Not set" is a gap in the data, not a category — leaving it at the top
  // of a table buries the answer.
  it("sorts biggest first but always sinks Not set to the bottom", () => {
    const mostlyBlank = [
      lead("a", null, { lead_source: null }),
      lead("b", null, { lead_source: null }),
      lead("c", null, { lead_source: null }),
      lead("d", null, { lead_source: "Meta" }),
    ];
    const rows = groupLeads(mostlyBlank, SOURCE, STAGE_TYPES, new Map());
    expect(rows.map((r) => r.bucket)).toEqual(["Meta", NOT_SET]);
  });

  it("breaks a tie by label so the order doesn't wobble between loads", () => {
    const tied = [
      lead("a", null, { lead_source: "Walk-in" }),
      lead("b", null, { lead_source: "Meta" }),
    ];
    expect(groupLeads(tied, SOURCE, STAGE_TYPES, new Map()).map((r) => r.label)).toEqual([
      "Meta",
      "Walk-in",
    ]);
  });

  it("counts a multi-value lead under each of its values", () => {
    const multi = [
      lead("a", "stage-won", { interested_exams: ["NID", "NIFT UG"] }),
      lead("b", null, { interested_exams: ["NID"] }),
    ];
    const rows = groupLeads(multi, EXAMS, STAGE_TYPES, new Map());
    expect(rows.map((r) => [r.label, r.total])).toEqual([
      ["NID", 2],
      ["NIFT UG", 1],
    ]);
    expect(oversubscribed(rows, multi.length)).toBe(true);
  });

  it("does not claim oversubscription for a single-value variable", () => {
    const rows = groupLeads(leads, SOURCE, STAGE_TYPES, new Map());
    expect(oversubscribed(rows, leads.length)).toBe(false);
  });

  it("labels through the resolved options so ids never reach the screen", () => {
    const centre = field({ key: "center_id", type: "select", label: "Centre" });
    const rows = groupLeads(
      [lead("a", null, { center_id: "uuid-1" })],
      centre,
      STAGE_TYPES,
      new Map([["uuid-1", "Kochi"]]),
    );
    expect(rows[0].label).toBe("Kochi");
    expect(rows[0].bucket).toBe("uuid-1");
  });
});

/**
 * A student who dropped out is still sitting in the Admission Confirmed
 * stage, so without this they go on counting as a conversion for as long
 * as the record exists — which is exactly what Leon asked to stop.
 */
describe("dropped students", () => {
  const leads = [
    lead("a", "stage-won", { lead_source: "Meta" }),
    lead("b", "stage-won", { lead_source: "Meta" }),
    lead("c", "stage-lost", { lead_source: "Walk-in" }),
  ];
  const dropped = new Set(["b"]);

  it("stops counting a dropped student as won, without hiding the lead", () => {
    expect(summarise(leads, STAGE_TYPES, dropped)).toEqual({
      total: 3,
      won: 1,
      lost: 1,
      dropped: 1,
    });
  });

  // Won and then undone is neither a win nor a loss — calling it lost
  // would flatter the lost-reason reports with a reason nobody gave.
  it("does not turn a drop into a loss", () => {
    const bothWon = [lead("a", "stage-won", {}), lead("b", "stage-won", {})];
    expect(summarise(bothWon, STAGE_TYPES, new Set(["b"]))).toEqual({
      total: 2,
      won: 1,
      lost: 0,
      dropped: 1,
    });
  });

  it("carries the drop into the breakdown rows", () => {
    const rows = groupLeads(leads, SOURCE, STAGE_TYPES, new Map(), dropped);
    const meta = rows.find((row) => row.label === "Meta");
    expect(meta).toMatchObject({ total: 2, won: 1, dropped: 1 });
  });

  it("counts everything the old way when nothing has been dropped", () => {
    expect(summarise(leads, STAGE_TYPES)).toEqual({ total: 3, won: 2, lost: 1, dropped: 0 });
  });
});
