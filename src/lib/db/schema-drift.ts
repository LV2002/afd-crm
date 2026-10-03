import "server-only";

import { is, sql } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";

import { db } from "./client";
import * as schema from "./schema";
import { compareSchema, type ExpectedTable, type SchemaDifference } from "./schema-compare";

/**
 * Does the live database have the shape this build was written against?
 *
 * The Drizzle table definitions are the code's own statement of what it
 * expects; `information_schema` is what the database actually has. Nothing
 * here reads a migration file, which is the point — migration bookkeeping
 * is exactly what was wrong the day this was written.
 */

/** Every table the code declares, with the column names it will select. */
export function expectedTables(): ExpectedTable[] {
  const tables: ExpectedTable[] = [];

  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const config = getTableConfig(value as PgTable);
    // Only `public`. Anything a migration put elsewhere is not something
    // the Drizzle schema describes.
    if (config.schema !== undefined && config.schema !== "public") continue;
    tables.push({
      name: config.name,
      columns: config.columns.map((column) => column.name),
    });
  }

  return tables.sort((a, b) => a.name.localeCompare(b.name));
}

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
