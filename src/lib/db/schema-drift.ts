import "server-only";

import { sql } from "drizzle-orm";

import { db } from "./client";
import { compareSchema, type SchemaDifference } from "./schema-compare";
import { expectedTables } from "./schema-drift-tables";

export { expectedTables };

/**
 * Does the live database have the shape this build was written against?
 *
 * The Drizzle table definitions are the code's own statement of what it
 * expects; `information_schema` is what the database actually has. Nothing
 * here reads a migration file, which is the point — migration bookkeeping
 * is exactly what was wrong the day this was written.
 */

export interface SchemaDriftReport extends SchemaDifference {
  tablesChecked: number;
  /** Set when the check itself could not run. Never a reason to fail a page. */
  error: string | null;
}

export async function getSchemaDrift(): Promise<SchemaDriftReport> {
  const expected = expectedTables();

  try {
    const result = await db.execute<{ table_name: string; column_name: string }>(
      sql`select table_name, column_name
          from information_schema.columns
          where table_schema = 'public'`,
    );
    const rows = (
      Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
    ) as Array<{ table_name: string; column_name: string }>;

    if (rows.length === 0) {
      // An empty answer is a broken reader, not a perfect database. Saying
      // "no drift" here would be the most dangerous way for this to be
      // wrong — the same trap `db:audit` fell into in session 23.
      return {
        missingTables: [],
        missingColumns: [],
        tablesChecked: expected.length,
        error: "The database returned no column information, so nothing could be compared.",
      };
    }

    const actual = new Map<string, Set<string>>();
    for (const row of rows) {
      const columns = actual.get(row.table_name) ?? new Set<string>();
      columns.add(row.column_name);
      actual.set(row.table_name, columns);
    }

    return { ...compareSchema(expected, actual), tablesChecked: expected.length, error: null };
  } catch (error) {
    return {
      missingTables: [],
      missingColumns: [],
      tablesChecked: expected.length,
      error: error instanceof Error ? error.message : "Could not read the database's schema.",
    };
  }
}
