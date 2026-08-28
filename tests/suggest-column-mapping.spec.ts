import { describe, expect, it } from "vitest";

import { suggestColumnMapping } from "../src/lib/leads/suggest-column-mapping";

const FIELDS = [
  { key: "student_name", label: "Student Name" },
  { key: "primary_phone", label: "Primary Phone" },
  { key: "email", label: "Email" },
  { key: "center_id", label: "Centre" },
];

describe("suggestColumnMapping", () => {
  it("matches a header that's an exact match for a field's key", () => {
    expect(suggestColumnMapping("student_name", FIELDS)).toBe("student_name");
  });

  it("matches a header that's an exact match for a field's label, ignoring case/spacing", () => {
    expect(suggestColumnMapping("STUDENT NAME", FIELDS)).toBe("student_name");
    expect(suggestColumnMapping("Primary Phone", FIELDS)).toBe("primary_phone");
  });

  it("matches a header that only partially overlaps a label", () => {
    expect(suggestColumnMapping("Centre Name", FIELDS)).toBe("center_id");
  });

  it("returns empty string (Skip) when nothing matches", () => {
    expect(suggestColumnMapping("Favourite Colour", FIELDS)).toBe("");
  });

  it("returns empty string for a blank header", () => {
    expect(suggestColumnMapping("   ", FIELDS)).toBe("");
  });
});
