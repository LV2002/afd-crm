import { describe, expect, it } from "vitest";

import { importableFields, RESOLVE_INPUT_KEYS } from "../src/lib/leads/importable-fields";
import type { FieldSchemaEntry } from "../src/lib/fields/get-field-schema";

function field(key: string, type: FieldSchemaEntry["type"]): FieldSchemaEntry {
  return {
    id: key,
    key,
    label: key,
    helpText: null,
    type,
    rawOptions: null,
    isCore: true,
    isRequired: false,
    section: "Tracking",
    sortOrder: 0,
    showInList: false,
    showInFilters: false,
    isEditable: true,
  };
}

describe("importableFields", () => {
  it("excludes assigned_to and stage_id regardless of type", () => {
    const fields = [field("assigned_to", "user_ref"), field("stage_id", "select"), field("student_name", "text")];
    const result = importableFields(fields).map((f) => f.key);
    expect(result).toEqual(["student_name"]);
  });

  it("excludes user_ref, lead_ref and file typed fields", () => {
    const fields = [
      field("some_user_field", "user_ref"),
      field("referred_lead", "lead_ref"),
      field("attachment", "file"),
      field("email", "email"),
    ];
    expect(importableFields(fields).map((f) => f.key)).toEqual(["email"]);
  });

  it("keeps every other field", () => {
    const fields = [field("temperature", "select"), field("brochure_sent", "boolean")];
    expect(importableFields(fields).map((f) => f.key)).toEqual(["temperature", "brochure_sent"]);
  });
});

describe("RESOLVE_INPUT_KEYS", () => {
  it("never overlaps with a field excluded from mapping entirely", () => {
    expect(RESOLVE_INPUT_KEYS.has("assigned_to")).toBe(false);
    expect(RESOLVE_INPUT_KEYS.has("stage_id")).toBe(false);
  });
});
