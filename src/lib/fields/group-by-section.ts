import type { FieldSchemaEntry } from "./get-field-schema";

export interface FieldSection {
  section: string;
  fields: FieldSchemaEntry[];
}

/**
 * Lead detail's tabs are generated from the distinct `section` values on
 * the schema, not hardcoded (docs/02-BUILD-PHASES.md, Phase 1) — an admin
 * adding a field with a brand-new section name gets a brand-new tab for
 * free. Section order follows each section's first-seen field, and fields
 * within it already arrive sorted by sort_order from getFieldSchema().
 */
export function groupBySection(fields: FieldSchemaEntry[]): FieldSection[] {
  const sections: FieldSection[] = [];
  const bySection = new Map<string, FieldSection>();

  for (const field of fields) {
    let section = bySection.get(field.section);
    if (!section) {
      section = { section: field.section, fields: [] };
      bySection.set(field.section, section);
      sections.push(section);
    }
    section.fields.push(field);
  }

  return sections;
}
