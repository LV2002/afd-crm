import { describe, expect, it } from "vitest";

import {
  districtsForState,
  INDIAN_STATES_DISTRICTS,
} from "../src/lib/geo/indian-states-districts";

describe("INDIAN_STATES_DISTRICTS", () => {
  it("covers all 28 states and 8 union territories with no duplicate state names", () => {
    expect(INDIAN_STATES_DISTRICTS).toHaveLength(36);
    const names = INDIAN_STATES_DISTRICTS.map((s) => s.state);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every state/UT lists at least one district", () => {
    for (const entry of INDIAN_STATES_DISTRICTS) {
      expect(entry.districts.length, entry.state).toBeGreaterThan(0);
    }
  });

  it("Kerala lists exactly its 14 districts, since AFD's own centres are there", () => {
    const kerala = districtsForState("Kerala");
    expect(kerala).toHaveLength(14);
    expect(kerala).toContain("Ernakulam");
    expect(kerala).toContain("Kannur");
  });

  it("returns an empty array for an unknown/unselected state, never throws", () => {
    expect(districtsForState("Narnia")).toEqual([]);
    expect(districtsForState(null)).toEqual([]);
    expect(districtsForState(undefined)).toEqual([]);
  });
});
