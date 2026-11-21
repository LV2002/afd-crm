import { describe, expect, it } from "vitest";

import { assignVariants, blankCount } from "../src/lib/whatsapp/ab-split";

describe("assignVariants", () => {
  it("splits as evenly as possible", () => {
    for (const n of [1, 2, 7, 100, 101]) {
      const v = assignVariants(n);
      const b = v.filter((x) => x === "b").length;
      expect(v).toHaveLength(n);
      expect(Math.abs(n - b - b)).toBeLessThanOrEqual(1);
    }
  });
  it("is random, not first-half/second-half", () => {
    let seed = 7;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const v = assignVariants(40, rng);
    expect(v.slice(0, 20).filter((x) => x === "b").length).toBeGreaterThan(3);
    expect(v.slice(0, 20).filter((x) => x === "a").length).toBeGreaterThan(3);
  });
  it("gives nobody a B for an empty audience", () => {
    expect(assignVariants(0)).toEqual([]);
  });
});

describe("blankCount", () => {
  it("is the highest placeholder number", () => {
    expect(blankCount("Hi {{1}}, {{2}} due {{3}}")).toBe(3);
    expect(blankCount("No blanks")).toBe(0);
  });
});
