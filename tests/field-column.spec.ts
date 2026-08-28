import { describe, expect, it } from "vitest";

import { fieldColumn } from "../src/lib/fields/field-column";

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
