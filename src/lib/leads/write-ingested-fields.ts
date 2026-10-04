import { Column, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { leads } from "@/lib/db/schema";
import { fieldColumn } from "@/lib/fields/field-column";
import type { MappableField } from "@/lib/integrations/meta/map-custom-answers";

import { isIngestableField } from "./ingest-protected-fields";

/**
 * Drizzle's `.set()` is keyed by the TypeScript property name
 * (`educationStatus`), while a field definition knows only the database
 * column (`education_status`). This is the bridge, built from the table
 * itself rather than a hand-written list — a column added to the schema
 * is mappable the moment it exists, and a key that is not a real column
 * cannot be written at all.
 *
 * That last part is the security property, not a convenience:
 * `field_definitions.key` is admin-entered text, so it must never reach
 * SQL as an identifier. Here it only ever looks something up in this map,
 * and a miss is skipped.
 */
const PROPERTY_BY_COLUMN: Map<string, string> = new Map(
  Object.entries(leads)
    .filter((entry): entry is [string, Column] => entry[1] instanceof Column)
    .map(([property, column]) => [column.name, property]),
);

export interface IngestedFieldWrite {
  /** Field keys actually written. */
  written: string[];
  /** Field keys that matched no real column and no custom slot, so nothing was written for them. */
  skipped: string[];
}

/**
 * Writes mapped field values onto a lead that has just been created by an
 * unattended ingestion path.
 *
 * **New leads only.** The caller checks `isNewLead` before calling. A
 * repeat enquiry from somebody already in the system must not have their
 * profile rewritten by whichever ad form they happened to fill in this
 * time — the same rule `resolveOrCreateLead()` already applies to the
 * fields it owns ("a lead's profile fields belong to the person, not to
 * any one enquiry") and that the CSV importer applies to the ones it
 * doesn't.
 *
 * Runs on the direct db client because its only callers are webhooks and
 * cron, which is exactly where CLAUDE.md non-negotiable #3 allows the
 * service-role path. The CSV importer has its own RLS-bound version of
 * this write (`writeExtraFields()` in leads/import/actions.ts) and should
 * keep it: there a real person with a real role is doing the importing,
 * and RLS is the right thing to be standing in the way.
 */
export async function writeIngestedLeadFields(
  leadId: string,
  values: Record<string, unknown>,
  fields: MappableField[],
): Promise<IngestedFieldWrite> {
  const fieldByKey = new Map(fields.map((field) => [field.key, field]));
  const coreUpdates: Record<string, unknown> = {};
  const customUpdates: Record<string, unknown> = {};
  const written: string[] = [];
  const skipped: string[] = [];

  for (const [key, value] of Object.entries(values)) {
    const field = fieldByKey.get(key);
    // Re-checked here rather than trusted from the caller: this function
    // is the last thing standing between a stranger's typed answer and
    // the leads table, and it is cheap to be sure.
    if (!field || !isIngestableField(field)) {
      skipped.push(key);
      continue;
    }

    if (field.isCore) {
      const property = PROPERTY_BY_COLUMN.get(fieldColumn(key));
      if (!property) {
        // A field flagged `is_core` whose column does not exist. This is
        // the exact shape of the bug migration 0075 had to repair on the
        // student fields: a definition claiming a column that was never
        // added. Skipped and reported rather than sent to Postgres, which
        // would reject the whole statement and lose the good values too.
        skipped.push(key);
        continue;
      }
      coreUpdates[property] = value;
    } else {
      customUpdates[key] = value;
    }
    written.push(key);
  }

  if (written.length === 0) return { written, skipped };

  const hasCustom = Object.keys(customUpdates).length > 0;

  await db
    .update(leads)
    .set({
      ...coreUpdates,
      // Merged rather than replaced. Nothing else has written `custom` on
      // a lead this new, but a jsonb column is a shared space and
      // clobbering it is the kind of thing that only shows up later.
      ...(hasCustom
        ? { custom: sql`coalesce(${leads.custom}, '{}'::jsonb) || ${JSON.stringify(customUpdates)}::jsonb` }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId));

  return { written, skipped };
}
