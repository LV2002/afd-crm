import { describe, expect, it } from "vitest";

import { groupBySection } from "../src/lib/fields/group-by-section";
import type { FieldSchemaEntry } from "../src/lib/fields/get-field-schema";

function field(overrides: Partial<FieldSchemaEntry> & Pick<FieldSchemaEntry, "key" | "section">): FieldSchemaEntry {
  return {
    id: overrides.key,
    label: overrides.key,
    helpText: null,
    type: "text",
    rawOptions: null,
    isCore: true,
    isRequired: false,
    sortOrder: 0,
    showInList: false,
    showInFilters: false,
    isEditable: true,
    ...overrides,
  };
}

describe("groupBySection", () => {
  it("groups fields under the distinct section values, in first-seen order", () => {
    const fields = [
      field({ key: "student_name", section: "Personal" }),
      field({ key: "exam_year", section: "Preferences" }),
      field({ key: "city", section: "Personal" }),
      field({ key: "t_shirt_size", section: "Custom" }),
    ];

    const sections = groupBySection(fields);

    expect(sections.map((s) => s.section)).toEqual(["Personal", "Preferences", "Custom"]);
    expect(sections[0].fields.map((f) => f.key)).toEqual(["student_name", "city"]);
    expect(sections[1].fields.map((f) => f.key)).toEqual(["exam_year"]);
    expect(sections[2].fields.map((f) => f.key)).toEqual(["t_shirt_size"]);
  });

  it("returns an empty array for an empty field list", () => {
    expect(groupBySection([])).toEqual([]);
  });

  it("a brand-new custom field's section becomes its own group with no code change", () => {
    const fields = [
      field({ key: "student_name", section: "Personal" }),
      field({ key: "shoe_size", section: "Merch", isCore: false }),
    ];
    const sections = groupBySection(fields);
    expect(sections.map((s) => s.section)).toContain("Merch");
  });
});
