/**
 * Comparing the schema the code expects against the one the database has.
 *
 * Pure — no database, no Drizzle — so the comparison can be tested without
 * either.
 *
 * ## Why counting migrations was not enough
 *
 * Settings → Platform Health already reports whether every migration has
 * run. On 3 October 2026 it reported, correctly, that all 78 had — while
 * `leads.assigned_at` was missing in production, because migration 0071
 * was recorded as applied with only part of it there. Confirming an
 * admission begins with `select *` on `leads`, so it died on a column that
 * the bookkeeping swore was present.
 *
 * A count answers "did the migrations run". This answers "is the database
 * actually the shape the code expects", which is the question that was
 * being asked all along.
 */

export interface ExpectedTable {
  name: string;
  columns: string[];
}

export interface SchemaDifference {
  /** Tables the code expects that the database does not have at all. */
  missingTables: string[];
  /** Columns the code expects that the database does not have. */
  missingColumns: Array<{ table: string; column: string }>;
}

/**
 * What the code expects, minus what the database has.
 *
 * Deliberately one-directional. A column in the database that the code
 * does not know about is harmless — an old column kept for a report, a
 * Supabase-managed addition — and listing those would fill the screen with
 * things nobody should act on. A column the code expects and the database
 * lacks is a crash waiting for whoever opens that screen.
 */
export function compareSchema(
  expected: ExpectedTable[],
  actual: Map<string, Set<string>>,
): SchemaDifference {
  const missingTables: string[] = [];
  const missingColumns: Array<{ table: string; column: string }> = [];

  for (const table of expected) {
    const live = actual.get(table.name);
    if (!live) {
      // Every column is missing too, but saying so once is the useful
      // version — a missing table is one fact, not forty.
      missingTables.push(table.name);
      continue;
    }
    for (const column of table.columns) {
      if (!live.has(column)) missingColumns.push({ table: table.name, column });
    }
  }

  missingTables.sort();
  missingColumns.sort((a, b) => a.table.localeCompare(b.table) || a.column.localeCompare(b.column));
  return { missingTables, missingColumns };
}

/** One line a person can act on, or null when the database matches. */
export function describeDifference(difference: SchemaDifference): string | null {
  const parts: string[] = [];
  if (difference.missingTables.length > 0) {
    parts.push(
      `${difference.missingTables.length} missing ${difference.missingTables.length === 1 ? "table" : "tables"} (${difference.missingTables.join(", ")})`,
    );
  }
  if (difference.missingColumns.length > 0) {
    const named = difference.missingColumns.map((c) => `${c.table}.${c.column}`);
    parts.push(
      `${named.length} missing ${named.length === 1 ? "column" : "columns"} (${named.join(", ")})`,
    );
  }
  return parts.length === 0 ? null : parts.join(", and ");
}
