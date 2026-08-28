import { describe, expect, it } from "vitest";

import { fieldColumn, fieldFilterExpression, getRawFieldValue } from "../src/lib/fields/field-column";

describe("fieldColumn", () => {
  it("maps the two mismatched core field keys to their real leads column", () => {
    expect(fieldColumn("lead_source")).toBe("last_touch_source");
    expect(fieldColumn("sub_source")).toBe("last_touch_sub_source");
  });

  it("passes through every other key unchanged (key === column name)", () => {
    expect(fieldColumn("student_name")).toBe("student_name");
    expect(fieldColumn("district")).toBe("district");
  });
});

describe("fieldFilterExpression", () => {
  it("a core field filters on its real column", () => {
    expect(fieldFilterExpression({ key: "district", isCore: true })).toBe("district");
  });

  it("a custom (non-core) field filters on the custom jsonb path, not a column of its own name", () => {
    expect(fieldFilterExpression({ key: "t_shirt_size", isCore: false })).toBe("custom->>t_shirt_size");
  });
});

describe("getRawFieldValue", () => {
  it("reads a core field straight off the row", () => {
    const row = { district: "Ernakulam" };
    expect(getRawFieldValue({ key: "district", isCore: true }, row)).toBe("Ernakulam");
  });

  it("reads a custom field out of the row's `custom` jsonb blob, not a same-named column", () => {
    const row = { custom: { t_shirt_size: "L" } };
    expect(getRawFieldValue({ key: "t_shirt_size", isCore: false }, row)).toBe("L");
  });

  it("returns null for a custom field missing from `custom`, or when `custom` itself is null", () => {
    expect(getRawFieldValue({ key: "t_shirt_size", isCore: false }, { custom: {} })).toBeNull();
    expect(getRawFieldValue({ key: "t_shirt_size", isCore: false }, { custom: null })).toBeNull();
  });
});
