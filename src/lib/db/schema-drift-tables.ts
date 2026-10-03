import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";

import * as schema from "./schema";
import type { ExpectedTable } from "./schema-compare";

/**
 * Every table the code declares, with the column names it will select.
 *
 * Free of `server-only` and of any database import, so the deploy's
 * migration step can use the same definition of "what the code expects"
 * that Settings → Platform Health shows. Two answers to that question
 * would be worse than none.
 */
export function expectedTables(): ExpectedTable[] {
  const tables: ExpectedTable[] = [];

  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const config = getTableConfig(value as PgTable);
    // Only `public`. Anything a migration put elsewhere is not something
    // the Drizzle schema describes.
    if (config.schema !== undefined && config.schema !== "public") continue;
    tables.push({ name: config.name, columns: config.columns.map((column) => column.name) });
  }

  return tables.sort((a, b) => a.name.localeCompare(b.name));
}
