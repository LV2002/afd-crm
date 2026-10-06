import { describe, expect, it } from "vitest";

import { importableFields, IMPORT_NOTE_KEY, RESOLVE_INPUT_KEYS } from "../src/lib/leads/importable-fields";
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
    expect(result).toEqual(["student_name", IMPORT_NOTE_KEY]);
  });

  it("excludes user_ref, lead_ref and file typed fields", () => {
    const fields = [
      field("some_user_field", "user_ref"),
      field("referred_lead", "lead_ref"),
      field("attachment", "file"),
      field("email", "email"),
    ];
    expect(importableFields(fields).map((f) => f.key)).toEqual(["email", IMPORT_NOTE_KEY]);
  });

  it("keeps every other field", () => {
    const fields = [field("temperature", "select"), field("brochure_sent", "boolean")];
    expect(importableFields(fields).map((f) => f.key)).toEqual([
      "temperature",
      "brochure_sent",
      IMPORT_NOTE_KEY,
    ]);
  });

  /**
   * The note target is not a lead field and must never be mistaken for
   * one: it is offered last, it is the only key that is not in the
   * schema it was built from, and `importLeads` removes it before
   * anything writes a column.
   */
  it("offers the note target last, and only once", () => {
    const keys = importableFields([field("student_name", "text")]).map((f) => f.key);
    expect(keys.at(-1)).toBe(IMPORT_NOTE_KEY);
    expect(keys.filter((k) => k === IMPORT_NOTE_KEY)).toHaveLength(1);
  });

  it("gives the note target a key no custom field could collide with", () => {
    // `field_definitions.key` is admin-editable at runtime; a counsellor
    // adding a field called "note" must not become this.
    expect(IMPORT_NOTE_KEY.startsWith("__")).toBe(true);
    expect(importableFields([field("note", "long_text")]).map((f) => f.key)).toEqual([
      "note",
      IMPORT_NOTE_KEY,
    ]);
  });
});

describe("RESOLVE_INPUT_KEYS", () => {
  it("never overlaps with a field excluded from mapping entirely", () => {
    expect(RESOLVE_INPUT_KEYS.has("assigned_to")).toBe(false);
    expect(RESOLVE_INPUT_KEYS.has("stage_id")).toBe(false);
  });
});
