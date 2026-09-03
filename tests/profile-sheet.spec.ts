/**
 * The printed student profile sheet.
 *
 * Two things are worth testing here and neither is arithmetic. First, the
 * sheet is a reproduction of a paper form AFD has used for years: a key
 * misspelt in PRINT_ROWS doesn't crash, it prints a blank column with a
 * raw key as its label, and nobody notices until it is on paper in front
 * of a parent. Second, the same layout is now printed from two places
 * (the student record and a lead's submitted profile form), so the
 * formatting has to behave identically whichever side supplies the values.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { FieldSchemaEntry } from "../src/lib/fields/get-field-schema";
import {
  BADGE_KEYS,
  PRINT_KEYS,
  PRINT_ROWS,
  buildSheetCells,
  formatPrintValue,
} from "../src/lib/print/profile-sheet";

const ROOT = join(__dirname, "..");

function field(overrides: Partial<FieldSchemaEntry> & { key: string }): FieldSchemaEntry {
  return {
    id: overrides.key,
    key: overrides.key,
    label: overrides.label ?? overrides.key,
    helpText: null,
    type: overrides.type ?? "text",
    rawOptions: null,
    isCore: false,
    isRequired: false,
    section: "Personal",
    sortOrder: 0,
    showInList: false,
    showInFilters: false,
    isEditable: true,
  };
}

/**
 * The seeded student field keys, read out of the seed file's text rather
 * than by importing it — seed.ts opens a database connection when loaded.
 */
function seededStudentKeys(): Set<string> {
  const source = readFileSync(join(ROOT, "src/lib/db/seed.ts"), "utf8");
  const start = source.indexOf("const STUDENT_FIELD_SEEDS");
  const end = source.indexOf("async function seedFieldDefinitionsFor");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const block = source.slice(start, end);
  return new Set([...block.matchAll(/key:\s*"([a-z0-9_]+)"/g)].map((m) => m[1]));
}

describe("printed sheet layout", () => {
  it("only names student fields that actually exist", () => {
    const seeded = seededStudentKeys();
    for (const key of PRINT_KEYS) {
      expect(seeded, `PRINT_ROWS names "${key}", which is not a seeded student field`).toContain(
        key,
      );
    }
  });

  it("matches the uploaded sheet row for row", () => {
    // The paper form, in order. Changing this test is changing the form.
    expect(PRINT_ROWS).toEqual([
      ["program", "current_batch_id"],
      ["dob", "mode"],
      ["city", "address"],
      ["pincode", "state"],
      ["email", "phone"],
      ["mother_name", "mother_phone"],
      ["father_name", "father_phone"],
      ["current_qualification", "design_discipline_interested"],
      ["target_exams", "last_school_attended"],
      ["art_teacher_name", "art_teacher_phone"],
      ["stream_11_12", "exam_board"],
      ["percentage_12th", "percentage_10th"],
      ["hobbies", "joined_at"],
    ]);
  });

  it("never prints the same field twice", () => {
    expect(new Set(PRINT_KEYS).size).toBe(PRINT_KEYS.length);
  });

  it("boxes only fields that are on the sheet", () => {
    for (const key of BADGE_KEYS) {
      expect(PRINT_KEYS).toContain(key);
    }
  });
});

describe("formatPrintValue", () => {
  it("prints an em dash for anything unanswered", () => {
    const f = field({ key: "city" });
    expect(formatPrintValue(f, null, [])).toBe("—");
    expect(formatPrintValue(f, undefined, [])).toBe("—");
    expect(formatPrintValue(f, "", [])).toBe("—");
  });

  it("resolves a select value to its label", () => {
    const f = field({ key: "mode", type: "select" });
    expect(formatPrintValue(f, "Online", [{ value: "Online", label: "Online Classes" }])).toBe(
      "Online Classes",
    );
  });

  it("falls back to the raw value when an option has gone", () => {
    // A dropdown option can be deactivated after a student picked it.
    // Printing the stored value beats printing nothing.
    const f = field({ key: "mode", type: "select" });
    expect(formatPrintValue(f, "Hybrid", [{ value: "Online", label: "Online" }])).toBe("Hybrid");
  });

  it("joins a multiselect with its labels", () => {
    const f = field({ key: "target_exams", type: "multiselect" });
    const options = [
      { value: "nid", label: "NID" },
      { value: "nift_ug", label: "NIFT UG" },
    ];
    expect(formatPrintValue(f, ["nid", "nift_ug"], options)).toBe("NID, NIFT UG");
  });

  it("suffixes the percentage fields", () => {
    expect(formatPrintValue(field({ key: "percentage_10th", type: "number" }), 87, [])).toBe("87%");
    expect(formatPrintValue(field({ key: "percentage_12th", type: "number" }), 91.5, [])).toBe(
      "91.5%",
    );
    // Not every number is a percentage.
    expect(formatPrintValue(field({ key: "pincode", type: "number" }), 682016, [])).toBe("682016");
  });

  it("prints a date the way a person in Kerala reads one", () => {
    expect(formatPrintValue(field({ key: "dob", type: "date" }), "2007-04-09", [])).toBe(
      "9 Apr 2007",
    );
  });
});

describe("buildSheetCells", () => {
  const fields = [
    field({ key: "city", label: "City" }),
    field({ key: "dob", label: "DOB", type: "date" }),
    field({ key: "comments", label: "Comments", type: "long_text" }),
  ];

  it("labels answers with the field definition's label", () => {
    const cells = buildSheetCells(fields, new Map(), (key) =>
      key === "city" ? "Kochi" : key === "dob" ? "2007-04-09" : null,
    );
    expect(cells.city).toEqual({ label: "City", display: "Kochi" });
    expect(cells.dob).toEqual({ label: "DOB", display: "9 Apr 2007" });
  });

  it("includes the comments row, which is not in PRINT_ROWS", () => {
    const cells = buildSheetCells(fields, new Map(), () => "note");
    expect(cells.comments?.display).toBe("note");
  });

  it("omits keys with no field definition rather than inventing a label", () => {
    // A field an admin deleted, or one hidden from this user's role: the
    // sheet falls back to the key as the label, which is visibly wrong
    // rather than silently plausible.
    const cells = buildSheetCells(fields, new Map(), () => "x");
    expect(cells.mother_name).toBeUndefined();
  });

  it("reads the same layout from either side of the form", () => {
    // The student record supplies columns; the lead supplies the
    // submitted jsonb blob. Same keys, so the same cells come out.
    const fromStudent = buildSheetCells(fields, new Map(), (key) =>
      ({ city: "Kannur", dob: "2006-01-02", comments: null })[key],
    );
    const answers: Record<string, unknown> = { city: "Kannur", dob: "2006-01-02" };
    const fromLead = buildSheetCells(fields, new Map(), (key) => answers[key] ?? null);
    expect(fromLead).toEqual(fromStudent);
  });
});

describe("student profile form composition", () => {
  it("keeps the seed and the migration backfill in agreement", () => {
    // Two lists of the same thing: which student fields are NOT asked of
    // the student. A fresh instance is seeded from one and an existing
    // one is backfilled from the other, so they diverging means two
    // installs of the same CRM show different forms.
    const seed = readFileSync(join(ROOT, "src/lib/db/seed.ts"), "utf8");
    const migration = readFileSync(
      join(ROOT, "src/lib/db/migrations/0035_student_profile_form_flag.sql"),
      "utf8",
    );

    const seedBlock = seed.slice(
      seed.indexOf("const STUDENT_FIELDS_OFF_PROFILE_FORM"),
      seed.indexOf("const STUDENT_FIELD_SEEDS"),
    );
    const seedKeys = [...seedBlock.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]).sort();

    const notInBlock = migration.slice(migration.indexOf("NOT IN ("));
    const migrationKeys = [...notInBlock.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]).sort();

    expect(seedKeys.length).toBeGreaterThan(0);
    expect(migrationKeys).toEqual(seedKeys);
  });

  it("does not ask a student for anything the institute assigns", () => {
    const seed = readFileSync(join(ROOT, "src/lib/db/seed.ts"), "utf8");
    const block = seed.slice(
      seed.indexOf("const STUDENT_FIELDS_OFF_PROFILE_FORM"),
      seed.indexOf("const STUDENT_FIELD_SEEDS"),
    );
    for (const key of ["center_id", "current_batch_id", "status", "joined_at"]) {
      expect(block, `a student should never be asked to set their own ${key}`).toContain(
        `"${key}"`,
      );
    }
  });
});
