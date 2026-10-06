import "server-only";

import { sqlClient } from "@/lib/db/client";

import { parseHeader, type ArchiveHeader } from "./format";
import { archiveTablesInOrder } from "./tables";

/**
 * Reading an archive back in.
 *
 * ## It refuses to restore over data
 *
 * This is the whole safety design, and it is deliberately blunt: if any
 * archivable table already has a row in it, the restore stops before
 * writing anything and names what it found.
 *
 * The alternative — merging, or overwriting by primary key — sounds more
 * useful and is a trap. Two archives taken from the same instance share
 * every id, so a "merge" is really an overwrite of whatever has happened
 * since; and a restore into a *different* instance would collide on
 * natural keys rather than silently clobbering. Neither is something an
 * administrator can reason about at the moment they most need to trust
 * the result. "Empty database only" is a rule that fits in a sentence
 * and cannot be misunderstood.
 *
 * Seeded configuration counts as data, which is why the error says so:
 * a fresh instance that has been seeded has to be emptied before an
 * archive goes into it, or it would end up with two of every stage.
 *
 * ## Why everything is one transaction
 *
 * A half-restored database is worse than no restore at all: it looks
 * populated, so nobody runs it again, and the missing rows are only
 * discovered later as broken references. Either the whole archive lands
 * or none of it does.
 */

export interface RestoreResult {
  ok: boolean;
  error?: string;
  header?: ArchiveHeader;
  /** Rows written per table, in restore order. */
  counts?: Array<{ table: string; rows: number }>;
  total?: number;
}

/** How many rows go in one insert. Postgres's parameter ceiling is 65535. */
const BATCH = 200;

/**
 * Column types, so a value can be handed to Postgres as what it is.
 *
 * The reason this is needed at all: a `jsonb` value comes out of
 * `select *` as a plain JavaScript object, survives the file as JSON,
 * and arrives back as a plain object — at which point the driver has no
 * idea it is JSON and refuses it outright ("the string argument must be
 * of type string… received an instance of Object"). It has to be told.
 *
 * Found from the catalog rather than declared, for the same reason the
 * table order is: a column added after this code was written must work
 * without anybody remembering to come back here.
 */
export async function jsonColumns(table: string): Promise<Set<string>> {
  const rows = await sqlClient<Array<{ column_name: string }>>`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${table}
      and data_type in ('json', 'jsonb')
  `;
  return new Set(rows.map((row) => row.column_name));
}

/**
 * One row, with its JSON columns serialised so the driver will send them.
 *
 * Measured, not assumed. Against this driver and connection settings:
 *
 *     plain object  → rejected ("received an instance of Object")
 *     sql.json(…)   → rejected, identically
 *     JSON.stringify → accepted, and Postgres casts the text to jsonb
 *
 * `sql.json()` reads like the intended tool and is not one here, which is
 * exactly the sort of thing that is discovered by trying it rather than
 * by reasoning about it. Everything else passes through untouched —
 * verified the same way: a text[] arrives as a JavaScript array and the
 * driver handles it; bigint, numeric, timestamptz and date all arrive as
 * strings Postgres parses; null stays null.
 */
export function prepareRow(
  row: Record<string, unknown>,
  jsonCols: Set<string>,
): Record<string, unknown> {
  if (jsonCols.size === 0) return row;
  const out: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) {
    out[column] = jsonCols.has(column) && value !== null ? JSON.stringify(value) : value;
  }
  return out;
}

/**
 * Tables that must be empty before a restore is allowed.
 *
 * Read from the live schema rather than the archive's header, so an
 * archive that happens to omit a table cannot smuggle a restore past a
 * table that has rows in it.
 */
async function nonEmptyTables(tables: string[]): Promise<string[]> {
  const populated: string[] = [];
  for (const table of tables) {
    const [row] = await sqlClient<Array<{ any: boolean }>>`
      select exists(select 1 from ${sqlClient(table)} limit 1) as any
    `;
    if (row?.any) populated.push(table);
  }
  return populated;
}

/**
 * Every sequence that backs a column, set past the largest restored value.
 *
 * Without this the first receipt written after a restore reuses a number
 * that is already on a receipt somebody has — and `receipts.receipt_no`
 * is the gapless sequence the ledger's integrity rests on (CLAUDE.md
 * § Non-negotiables 7). `pg_get_serial_sequence` finds them from the
 * catalog rather than from a list, for the same reason the table order
 * is computed: a list is a second copy of the truth.
 */
async function resyncSequences(tables: string[]): Promise<void> {
  for (const table of tables) {
    const columns = await sqlClient<Array<{ column_name: string }>>`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ${table}
        and column_default like 'nextval(%'
    `;
    for (const { column_name: column } of columns) {
      await sqlClient`
        select setval(
          pg_get_serial_sequence(${table}, ${column}),
          coalesce((select max(${sqlClient(column)}) from ${sqlClient(table)}), 0) + 1,
          false
        )
      `;
    }
  }
}

export async function restoreArchive(contents: string): Promise<RestoreResult> {
  const lines = contents.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { ok: false, error: "The archive file is empty." };

  const parsed = parseHeader(lines[0]);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const header = parsed.header;

  // Grouped before anything is written, so a malformed line two thirds
  // of the way down is found before the first insert rather than after.
  const byTable = new Map<string, Array<Record<string, unknown>>>();
  for (let index = 1; index < lines.length; index++) {
    let row: { t?: unknown; r?: unknown };
    try {
      row = JSON.parse(lines[index]) as { t?: unknown; r?: unknown };
    } catch {
      return {
        ok: false,
        error: `Line ${index + 1} of the archive is not readable. The file may have been truncated or edited — restore the original download.`,
      };
    }
    if (typeof row.t !== "string" || typeof row.r !== "object" || row.r === null) {
      return { ok: false, error: `Line ${index + 1} of the archive is not a table row.` };
    }
    if (!byTable.has(row.t)) byTable.set(row.t, []);
    byTable.get(row.t)!.push(row.r as Record<string, unknown>);
  }

  // The live order, not the archive's: a table added since the archive
  // was written has to be inserted in the right place even though the
  // file knows nothing about it.
  const order = await archiveTablesInOrder();
  const unknown = [...byTable.keys()].filter((table) => !order.includes(table));
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `This archive contains tables this version of the CRM does not have: ${unknown.join(", ")}. It was taken from a newer or different deployment.`,
    };
  }

  const populated = await nonEmptyTables(order);
  if (populated.length > 0) {
    return {
      ok: false,
      error: `This database already has data in it (${populated.slice(0, 5).join(", ")}${populated.length > 5 ? `, and ${populated.length - 5} more` : ""}). A restore only runs into an empty database, so that it can never overwrite records that are already here. Empty it first, or restore into a fresh instance.`,
    };
  }

  const counts: Array<{ table: string; rows: number }> = [];
  let total = 0;

  await sqlClient.begin(async (tx) => {
    for (const table of order) {
      const rows = byTable.get(table);
      if (!rows || rows.length === 0) continue;

      const jsonCols = await jsonColumns(table);

      for (let index = 0; index < rows.length; index += BATCH) {
        const batch = rows.slice(index, index + BATCH).map((row) => prepareRow(row, jsonCols));
        // Column names come from the archive, not from a schema the code
        // holds — `sql(batch, ...columns)` is how postgres.js takes a
        // runtime column list without string concatenation.
        const columns = Object.keys(batch[0]);
        await tx`insert into ${tx(table)} ${tx(batch, ...columns)}`;
      }

      counts.push({ table, rows: rows.length });
      total += rows.length;
    }
  });

  await resyncSequences(order);

  return { ok: true, header, counts, total };
}
