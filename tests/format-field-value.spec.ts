import { describe, expect, it } from "vitest";

import { formatFieldValue } from "../src/lib/fields/format-field-value";
import type { FieldSchemaEntry } from "../src/lib/fields/get-field-schema";

function baseField(overrides: Partial<FieldSchemaEntry> = {}): FieldSchemaEntry {
  return {
    id: "field-1",
    key: "some_field",
    label: "Some Field",
    helpText: null,
    type: "text",
    rawOptions: null,
    isCore: true,
    isRequired: false,
    section: "Personal",
    sortOrder: 0,
    showInList: true,
    showInFilters: false,
    isEditable: true,
    ...overrides,
  };
}

describe("formatFieldValue", () => {
  it("renders an em dash for null, undefined and empty string", () => {
    const field = baseField();
    expect(formatFieldValue(field, null)).toBe("—");
    expect(formatFieldValue(field, undefined)).toBe("—");
    expect(formatFieldValue(field, "")).toBe("—");
  });

  it("renders boolean fields as Yes/No", () => {
    const field = baseField({ type: "boolean" });
    expect(formatFieldValue(field, true)).toBe("Yes");
    expect(formatFieldValue(field, false)).toBe("No");
  });

  it("renders a date in IST as d MMM yyyy", () => {
    const field = baseField({ type: "date" });
    expect(formatFieldValue(field, "2027-03-15")).toBe("15 Mar 2027");
  });

  it("resolves a select field's raw value to its label via the options map", () => {
    const field = baseField({ type: "select", key: "temperature" });
    const options = { temperature: [{ value: "hot", label: "Hot" }] };
    expect(formatFieldValue(field, "hot", options)).toBe("Hot");
  });

  it("falls back to the raw value when a select option isn't in the map", () => {
    const field = baseField({ type: "select", key: "temperature" });
    expect(formatFieldValue(field, "warm", {})).toBe("warm");
  });

  it("joins a multiselect field's resolved labels", () => {
    const field = baseField({ type: "multiselect", key: "interested_exams" });
    const options = {
      interested_exams: [
        { value: "nid", label: "NID" },
        { value: "uceed", label: "UCEED" },
      ],
    };
    expect(formatFieldValue(field, ["nid", "uceed"], options)).toBe("NID, UCEED");
  });

  it("renders an empty multiselect array as an em dash", () => {
    const field = baseField({ type: "multiselect", key: "interested_exams" });
    expect(formatFieldValue(field, [], {})).toBe("—");
  });

  it("renders a plain text/number field with String()", () => {
    const field = baseField({ type: "number" });
    expect(formatFieldValue(field, 3)).toBe("3");
  });
});
