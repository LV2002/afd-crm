import { describe, expect, it } from "vitest";

import { OPTION_VALUE_PATTERN, movedOrder, slugifyValue } from "@/lib/dropdowns/option-helpers";

describe("slugifyValue", () => {
  it("makes a legal value from what somebody would type as a label", () => {
    expect(slugifyValue("Saudi Arabia")).toBe("saudi_arabia");
    expect(slugifyValue("UAE")).toBe("uae");
    expect(slugifyValue("  Walk-in / referral ")).toBe("walk_in_referral");
    expect(slugifyValue("Q&A")).toBe("q_and_a");
  });

  it("starts with a letter, as a stored value must", () => {
    expect(slugifyValue("2027 batch")).toBe("o_2027_batch");
    for (const label of ["Saudi Arabia", "UAE", "2027 batch", "Kuwait", "Others"]) {
      expect(OPTION_VALUE_PATTERN.test(slugifyValue(label))).toBe(true);
    }
  });

  it("is empty for a label with nothing usable in it", () => {
    expect(slugifyValue("!!!")).toBe("");
    expect(slugifyValue("")).toBe("");
  });
});

describe("movedOrder", () => {
  const ids = ["a", "b", "c", "d"];

  it("moves one place up or down", () => {
    expect(movedOrder(ids, "c", "up")).toEqual(["a", "c", "b", "d"]);
    expect(movedOrder(ids, "b", "down")).toEqual(["a", "c", "b", "d"]);
  });

  it("returns null at either end, and for an unknown id", () => {
    expect(movedOrder(ids, "a", "up")).toBeNull();
    expect(movedOrder(ids, "d", "down")).toBeNull();
    expect(movedOrder(ids, "zzz", "up")).toBeNull();
  });

  it("does not change its input", () => {
    const copy = [...ids];
    movedOrder(copy, "b", "down");
    expect(copy).toEqual(ids);
  });
});
