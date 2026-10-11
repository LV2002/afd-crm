/**
 * The PostgREST filter that keeps a list to leads still being worked.
 *
 * Pure. Two hazards, both silent: `NOT IN` drops NULLs (so an unclassified
 * lead would vanish from every list), and the values come from an
 * admin-editable table and are parsed by PostgREST (so a comma could open
 * a second clause).
 */
import { describe, expect, it } from "vitest";

import { unfinishedLeadsFilter } from "@/lib/leads/finished-filter";

describe("unfinishedLeadsFilter", () => {
  it("keeps leads with no temperature", () => {
    expect(unfinishedLeadsFilter(["negative"])).toMatch(/^temperature\.is\.null,/);
  });

  it("excludes every finished value", () => {
    expect(unfinishedLeadsFilter(["took_admission", "negative"])).toBe(
      'temperature.is.null,temperature.not.in.("took_admission","negative")',
    );
  });

  it("is null when nothing is finished, so the caller adds no filter at all", () => {
    expect(unfinishedLeadsFilter([])).toBeNull();
  });

  it("quotes a value so punctuation cannot open another clause", () => {
    const filter = unfinishedLeadsFilter(['a,temperature.eq.hot', 'say "no"']);
    expect(filter).toContain('"a,temperature.eq.hot"');
    expect(filter).toContain('"say \\"no\\""');
  });

  it("accepts a Set, which is what the callers hold", () => {
    expect(unfinishedLeadsFilter(new Set(["negative"]))).toContain('"negative"');
  });
});
