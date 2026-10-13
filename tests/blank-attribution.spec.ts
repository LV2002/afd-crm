import { describe, expect, it } from "vitest";

import { fieldColumn, getRawFieldValue, isBlankAttribution } from "@/lib/fields/field-column";

describe("isBlankAttribution", () => {
  it("refuses to clear a lead's source or sub-source", () => {
    for (const key of ["lead_source", "sub_source"]) {
      expect(isBlankAttribution(key, null)).toBe(true);
      expect(isBlankAttribution(key, "")).toBe(true);
      expect(isBlankAttribution(key, "   ")).toBe(true);
      expect(isBlankAttribution(key, undefined)).toBe(true);
    }
  });

  it("lets a source be changed to a different one", () => {
    expect(isBlankAttribution("lead_source", "walk_in")).toBe(false);
  });

  it("does not interfere with any other field", () => {
    expect(isBlankAttribution("city", "")).toBe(false);
    expect(isBlankAttribution("email", null)).toBe(false);
  });
});

describe("the lead page reads Lead Source from the column it is stored in", () => {
  it("maps lead_source and sub_source onto last-touch columns", () => {
    expect(fieldColumn("lead_source")).toBe("last_touch_source");
    expect(fieldColumn("sub_source")).toBe("last_touch_sub_source");
    const row = { last_touch_source: "meta", last_touch_sub_source: "1104877" };
    expect(getRawFieldValue({ key: "lead_source", isCore: true }, row)).toBe("meta");
    expect(getRawFieldValue({ key: "sub_source", isCore: true }, row)).toBe("1104877");
  });
});
