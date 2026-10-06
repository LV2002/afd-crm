/**
 * The starter spreadsheet handed to somebody bulk-importing their leads.
 *
 * Generated from `field_definitions` rather than committed as a file, so
 * that it cannot disagree with what the column mapper accepts. These
 * tests pin the two things that make it useful rather than decorative:
 * that its header matches the importer's own field list, and that its
 * example row answers the format questions a person actually has.
 */
import { describe, expect, it } from "vitest";

import type { FieldSchemaEntry } from "../src/lib/fields/get-field-schema";
import { buildImportTemplate } from "../src/lib/leads/import-template";

function field(partial: Partial<FieldSchemaEntry> & { key: string }): FieldSchemaEntry {
  // Defaults first, caller's values second. Writing `key: partial.key`
  // above a `...partial` spread is a TS2783 — the spread overwrites it,
  // so the explicit line is both redundant and an error.
  return {
    label: partial.key,
    type: "text",
    section: "Personal",
    isCore: true,
    isRequired: false,
    ...partial,
  } as FieldSchemaEntry;
}

const BASE = [
  field({ key: "student_name", label: "Student Name", isRequired: true }),
  field({ key: "primary_phone", label: "Primary Phone", type: "phone", isRequired: true }),
  field({ key: "dob", label: "Date of Birth", type: "date" }),
  field({ key: "interested_exams", label: "Interested Exams", type: "multiselect" }),
  field({ key: "brochure_sent", label: "Brochure Sent", type: "boolean" }),
];

function rows(csv: string): string[][] {
  return csv
    .trim()
    .split("\n")
    .map((line) => line.split(","));
}

describe("the import template", () => {
  it("heads each column with the field's label, not its key", () => {
    // A person checks "Student Name" against their own spreadsheet; they
    // copy `student_name` without reading it. The mapper accepts either.
    const [header] = rows(buildImportTemplate({ fields: BASE, optionsByKey: {} }));
    expect(header).toContain("Student Name");
    expect(header).not.toContain("student_name");
  });

  it("leaves out the fields the importer refuses to map", () => {
    // Assignment and stage are set by the rules engine on every ingestion
    // path (non-negotiable #8). Offering them in a template would invite
    // a spreadsheet that silently bypasses it.
    const fields = [
      ...BASE,
      field({ key: "assigned_to", label: "Assigned Counsellor", type: "user_ref" }),
      field({ key: "stage_id", label: "Stage", type: "select" }),
    ];
    const [header] = rows(buildImportTemplate({ fields, optionsByKey: {} }));
    expect(header).not.toContain("Assigned Counsellor");
    expect(header).not.toContain("Stage");
  });

  it("dates the example in ISO, because the importer guesses otherwise", () => {
    // `05/06/2026` is June 5th to half the world and May 6th to the
    // other half, and the importer hands the string to `new Date()`,
    // which picks one without saying which.
    const [, example] = rows(buildImportTemplate({ fields: BASE, optionsByKey: {} }));
    const dob = example[2];
    expect(dob).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("shows a multiselect as real options, comma separated", () => {
    // The two questions somebody has are "which values are allowed" and
    // "how do I put two in one cell". A real option answers both and
    // imports cleanly; an invented one would warn on import.
    const csv = buildImportTemplate({
      fields: BASE,
      optionsByKey: {
        interested_exams: [
          { value: "nid", label: "NID" },
          { value: "nift_ug", label: "NIFT UG" },
          { value: "uceed", label: "UCEED" },
        ],
      },
    });
    // Asserted on the raw file, not a split-on-comma: the cell contains a
    // comma and is therefore quoted, which is the behaviour below.
    expect(csv).toContain('"NID, NIFT UG"');
    expect(csv).not.toContain("UCEED");
  });

  it("writes yes/no for a boolean, which is what the parser reads", () => {
    const csv = buildImportTemplate({ fields: BASE, optionsByKey: {} });
    expect(rows(csv)[1].at(-1)).toBe("no");
  });

  it("quotes a value containing a comma so the file still parses", () => {
    const csv = buildImportTemplate({
      fields: [field({ key: "x", label: "Exams", type: "multiselect" })],
      optionsByKey: { x: [{ value: "a", label: "NID" }, { value: "b", label: "NIFT UG" }] },
    });
    expect(csv).toContain('"NID, NIFT UG"');
    // Two lines, not three — an unquoted comma would have split the row.
    expect(csv.trim().split("\n")).toHaveLength(2);
  });

  it("ends with a newline", () => {
    // A file without one appends to whatever follows it when somebody
    // concatenates two exports.
    expect(buildImportTemplate({ fields: BASE, optionsByKey: {} }).endsWith("\n")).toBe(true);
  });
});
