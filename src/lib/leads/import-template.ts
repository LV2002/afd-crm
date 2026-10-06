import "server-only";

import type { FieldSchemaEntry } from "@/lib/fields/get-field-schema";
import type { FieldOption } from "@/lib/fields/resolve-field-options";

import { importableFields } from "./importable-fields";

/**
 * A starter spreadsheet, built from the fields this instance actually has.
 *
 * ## Why generated and not a file in the repo
 *
 * The importer's targets come from `field_definitions`, which an admin
 * edits without a deploy — that is the whole point of CLAUDE.md § 10. A
 * template committed as a static file is correct on the day it is written
 * and wrong the first time somebody adds a custom field, and the person
 * it misleads is the one doing a one-off bulk import who has no way to
 * know the file is stale.
 *
 * So it is produced on demand from the same `importableFields()` the
 * column mapper offers, which makes the two incapable of disagreeing.
 *
 * ## Two rows, and why the second one is the useful one
 *
 * Row 1 is the header. Row 2 is a worked example — a plausible Kerala
 * enquiry rather than `string`/`value`/`foo`, because the questions
 * somebody actually has are "what format is the date" and "how do I put
 * two exams in one cell", and an example answers both without being read
 * as instructions.
 *
 * The example is filled in for every column on purpose, including the
 * optional ones. A blank cell in a sample teaches nothing; a filled one
 * shows the shape, and deleting a column is easier than inventing it.
 */

/** What a sample cell should contain, by field type. */
function sampleFor(field: FieldSchemaEntry, options: FieldOption[]): string {
  // A real option beats an invented one: a select only accepts values it
  // knows, so showing one proves the format and imports cleanly.
  if ((field.type === "select" || field.type === "multiselect") && options.length > 0) {
    const labels = options.slice(0, field.type === "multiselect" ? 2 : 1).map((o) => o.label);
    return labels.join(", ");
  }

  switch (field.key) {
    case "student_name":
      return "Aleena Thomas";
    case "father_name":
      return "Thomas Mathew";
    case "primary_phone":
      return "+919847012345";
    case "alternate_phone":
      return "+919447098765";
    case "email":
      return "aleena.thomas@example.com";
    case "city":
      return "Kochi";
    case "pincode":
      return "682016";
    case "school_college":
      return "St Teresa's Higher Secondary School";
    case "exam_year":
      return "2027";
    case "sub_source":
      return "Walk-in at Kochi centre";
    case "parents_occupation":
      return "Architect";
    case "competitor_institute":
      return "";
    default:
      break;
  }

  switch (field.type) {
    case "phone":
      return "+919847012345";
    case "email":
      return "aleena.thomas@example.com";
    case "url":
      return "https://example.com";
    // ISO, deliberately. `05/06/2026` is the fifth of June to half the
    // world and the sixth of May to the other half, and the importer
    // hands the string to `new Date()` — which picks one without saying.
    case "date":
      return "2009-04-15";
    case "datetime":
      return "2026-10-20 11:00";
    case "number":
      return "1";
    case "currency":
      return "25000";
    case "boolean":
      return "no";
    case "long_text":
      return "Asked about the NID foundation batch timings.";
    default:
      return "";
  }
}

/** RFC 4180: quote anything containing a comma, quote or newline. */
function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export interface TemplateInput {
  fields: FieldSchemaEntry[];
  optionsByKey: Record<string, FieldOption[]>;
}

export function buildImportTemplate({ fields, optionsByKey }: TemplateInput): string {
  const usable = importableFields(fields);

  // Labels, not keys. The mapper matches on either, and a header reading
  // "Student Name" is one a person can check against their own
  // spreadsheet; `student_name` is one they copy without reading.
  const header = usable.map((field) => csvCell(field.label));
  const example = usable.map((field) => csvCell(sampleFor(field, optionsByKey[field.key] ?? [])));

  // A trailing newline, because a file without one appends to whatever
  // comes next when somebody concatenates two exports.
  return `${header.join(",")}\n${example.join(",")}\n`;
}

export function importTemplateFileName(now = new Date()): string {
  return `afd-crm-lead-import-template-${now.toISOString().slice(0, 10)}.csv`;
}
