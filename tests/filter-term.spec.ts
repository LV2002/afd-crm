import { describe, expect, it } from "vitest";

import { filterTerm } from "@/lib/db/filter-term";

describe("filterTerm", () => {
  it("leaves an ordinary search alone", () => {
    expect(filterTerm("Anjali")).toBe("Anjali");
    expect(filterTerm("9847012345")).toBe("9847012345");
    expect(filterTerm("Sree Narayana")).toBe("Sree Narayana");
  });

  it("defuses an injected second clause", () => {
    // Without this, the comma ends the ilike clause and everything after
    // it becomes a filter of the attacker's choosing.
    expect(filterTerm("x,primary_phone.ilike.%9%")).toBe("x primary_phone ilike 9");
    expect(filterTerm("a),or(id.eq.1")).toBe("a or id eq 1");
  });

  it("strips the wildcards, so a search cannot match everything", () => {
    expect(filterTerm("%")).toBe("");
    expect(filterTerm("*")).toBe("");
    expect(filterTerm("%anj%")).toBe("anj");
  });

  it("collapses the whitespace it creates and trims", () => {
    expect(filterTerm("  a,,,b  ")).toBe("a b");
  });

  it("handles quotes and backslashes without leaving a dangling escape", () => {
    expect(filterTerm('O\\"Brien')).toBe("O Brien");
    expect(filterTerm("d'Souza")).toBe("d Souza");
  });

  it("returns empty for a search made only of metacharacters", () => {
    // The caller checks for empty and skips the filter entirely, rather
    // than searching for nothing and matching everything.
    expect(filterTerm(",,,")).toBe("");
  });
});
