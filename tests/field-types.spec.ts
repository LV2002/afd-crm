/**
 * The three lists of field types that have to agree.
 *
 * The type is written by the settings form, read by the schema loader, and
 * stored in a Postgres enum. Three copies of one list, and a mismatch does
 * not show up until somebody picks the type that only two of them know
 * about — which is a 500 on save, or a field that renders as a text box
 * because the renderer has never heard of it.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { FIELD_TYPES as SETTINGS_TYPES, FIELD_TYPE_LABELS } from "../src/app/(app)/settings/fields/constants";
import { FIELD_TYPES as SCHEMA_TYPES } from "../src/lib/fields/get-field-schema";

/** The values in the `field_type` pgEnum, read from the schema file itself. */
function enumValuesFromSchema(): string[] {
  const source = readFileSync("src/lib/db/schema/reference.ts", "utf8");
  const match = source.match(/fieldTypeEnum = pgEnum\("field_type",\s*\[([^\]]*)\]/);
  if (!match) throw new Error("Could not find fieldTypeEnum in reference.ts");
  return [...match[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

describe("field types", () => {
  it("are the same list in the settings form and the schema loader", () => {
    expect([...SETTINGS_TYPES]).toEqual([...SCHEMA_TYPES]);
  });

  it("are the same list as the database enum", () => {
    // A type the database does not have is a failed insert; one it has and
    // the app does not is a field nothing can render.
    expect([...SETTINGS_TYPES].sort()).toEqual(enumValuesFromSchema().sort());
  });

  it("every type says in plain words what it is", () => {
    // The reason this file exists: `url` and `file` are indistinguishable
    // as enum names to somebody adding a question about a photograph, and
    // a type with no description is the next one to be picked by mistake.
    for (const type of SETTINGS_TYPES) {
      const entry = FIELD_TYPE_LABELS[type];
      expect(entry, type).toBeDefined();
      expect(entry.label.length, type).toBeGreaterThan(2);
      expect(entry.hint.length, type).toBeGreaterThan(10);
      // The label is what a person reads; it must not just be the enum.
      expect(entry.label, type).not.toBe(type);
    }
  });

  it("tells the upload type apart from the link type, in both directions", () => {
    // The specific confusion that produced a photo question storing a URL.
    expect(FIELD_TYPE_LABELS.file.label).toMatch(/upload/i);
    expect(FIELD_TYPE_LABELS.file.hint).toMatch(/attach/i);
    expect(FIELD_TYPE_LABELS.url.hint).toMatch(/not for uploading/i);
  });
});
