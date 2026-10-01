/**
 * Clears everything that happened, and keeps everything you set up.
 *
 * The step between "we have finished testing" and "we are live": leads,
 * enquiries, admissions, payments, receipts, bank entries, students,
 * profile forms, files, messages and the audit trail all go. Centres,
 * users, roles, stages, rules, fields, fee structures, templates, batches,
 * bank accounts and every other setting stay exactly as they are.
 *
 *   npm run db:reset-data                 what WOULD be deleted. Changes nothing.
 *   npm run db:reset-data -- --confirm    actually do it.
 *
 * Deliberately a command-line tool and never a button. A button like this
 * gets pressed by somebody who thought it meant something else; a command
 * with a typed confirmation does not get pressed by accident.
 */
import "./load-env";

import { createInterface } from "node:readline/promises";

import { sql } from "drizzle-orm";

import { db } from "./client";
import { CONFIG_TABLES, DATA_TABLES, UNOWNED_SEQUENCES } from "./reset-tables";

const CONFIRM_PHRASE = "DELETE THE TEST DATA";

interface Options {
  confirm: boolean;
  keepAdSpend: boolean;
  purgeFiles: boolean;
  /** Skips the typed prompt. For a scripted run; still needs --confirm. */
  yes: boolean;
}

function parseArgs(argv: string[]): Options {
  return {
    confirm: argv.includes("--confirm"),
    keepAdSpend: argv.includes("--keep-ad-spend"),
    purgeFiles: argv.includes("--purge-files"),
    yes: argv.includes("--yes"),
  };
}

async function countRows(tables: readonly string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const table of tables) {
    const rows = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from ${sql.identifier(table)}`,
    );
    counts.set(table, rows[0]?.n ?? 0);
  }
  return counts;
}

/**
 * Every table the database actually has, so a table nobody classified
 * cannot be silently skipped.
 */
async function liveTables(): Promise<string[]> {
  const rows = await db.execute<{ tablename: string }>(sql`
    select tablename from pg_tables where schemaname = 'public' order by tablename
  `);
  return rows.map((row) => row.tablename);
}

function printCounts(title: string, counts: Map<string, number>): number {
  const withRows = [...counts.entries()].filter(([, n]) => n > 0);
  const total = withRows.reduce((sum, [, n]) => sum + n, 0);

  console.log(`\n${title}`);
  if (withRows.length === 0) {
    console.log("  (nothing — already empty)");
    return 0;
  }
  const width = Math.max(...withRows.map(([table]) => table.length));
  for (const [table, n] of withRows.sort((a, b) => b[1] - a[1])) {
    console.log(`  ${table.padEnd(width)}  ${String(n).padStart(7)}`);
  }
  console.log(`  ${"TOTAL".padEnd(width)}  ${String(total).padStart(7)}`);
  return total;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  // A table added later and classified as neither is the failure mode this
  // whole design exists to prevent: it would be left behind, full of rows
  // pointing at leads that no longer exist.
  const live = await liveTables();
  const classified = new Set<string>([...CONFIG_TABLES, ...DATA_TABLES]);
  const unclassified = live.filter((table) => !classified.has(table));
  if (unclassified.length > 0) {
    console.error(
      `\nRefusing to run. These tables are in the database but are neither\n` +
        `configuration nor data as far as this script knows:\n\n` +
        unclassified.map((table) => `  ${table}`).join("\n") +
        `\n\nAdd each one to CONFIG_TABLES or DATA_TABLES in\n` +
        `src/lib/db/reset-tables.ts, then run this again.\n`,
    );
    process.exit(1);
  }

  const toClear = DATA_TABLES.filter(
    (table) => !(options.keepAdSpend && table === "ad_spend_daily"),
  );

  const dataCounts = await countRows(toClear);
  const configBefore = await countRows(CONFIG_TABLES);

  console.log(`\n  Database: ${redactUrl(process.env.DATABASE_URL ?? "")}`);
  const total = printCounts("WILL BE DELETED", dataCounts);
  printCounts("WILL BE KEPT", configBefore);

  if (!options.confirm) {
    console.log(
      `\nThis was a dry run and nothing has changed.\n` +
        `To do it for real:  npm run db:reset-data -- --confirm\n`,
    );
    await db.$client.end();
    return;
  }

  if (total === 0) {
    console.log("\nNothing to delete. Stopping.\n");
    await db.$client.end();
    return;
  }

  if (!options.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      `\nThis deletes ${total} rows and cannot be undone.\n` +
        `Type ${CONFIRM_PHRASE} to go ahead: `,
    );
    rl.close();
    if (answer.trim() !== CONFIRM_PHRASE) {
      console.log("\nStopped. Nothing has changed.\n");
      await db.$client.end();
      return;
    }
  }

  /**
   * One transaction, with the configuration counted again inside it.
   *
   * `TRUNCATE ... CASCADE` reaches any table holding a foreign key into
   * one being truncated. Every such table should already be on the data
   * list — but "should" is not a guarantee, and the cost of being wrong is
   * somebody's centres and users. So the configuration is counted before
   * and after, and a single row lost anywhere rolls the whole thing back.
   */
  await db.transaction(async (tx) => {
    const list = sql.join(
      toClear.map((table) => sql.identifier(table)),
      sql`, `,
    );
    await tx.execute(sql`truncate table ${list} restart identity cascade`);

    for (const sequence of UNOWNED_SEQUENCES) {
      await tx.execute(sql`alter sequence ${sql.identifier(sequence)} restart with 1`);
    }

    for (const table of CONFIG_TABLES) {
      const rows = await tx.execute<{ n: number }>(
        sql`select count(*)::int as n from ${sql.identifier(table)}`,
      );
      const after = rows[0]?.n ?? 0;
      const before = configBefore.get(table) ?? 0;
      if (after !== before) {
        throw new Error(
          `Rolling back: ${table} went from ${before} rows to ${after}. ` +
            `A cascade reached configuration, which must never happen. Nothing has been deleted.`,
        );
      }
    }

    // The reset writes itself into the empty audit log. After a wipe every
    // other audit row would point at something that no longer exists; this
    // one is the fact that still matters.
    await tx.execute(sql`
      insert into audit_log (action, entity_type, after)
      values (
        'system.reset_operational_data',
        'database',
        ${JSON.stringify({
          deletedRows: total,
          tables: toClear,
          at: new Date().toISOString(),
        })}::jsonb
      )
    `);
  });

  console.log(`\nDone. ${total} rows cleared. Lead numbers and receipt numbers start again at 1.`);

  if (options.purgeFiles) {
    await purgeStorage();
  } else {
    console.log(
      `\nThe uploaded files are still in Supabase Storage, with nothing pointing at them.\n` +
        `Clear them too with:  npm run db:reset-data -- --confirm --purge-files\n`,
    );
  }

  await db.$client.end();
}

/**
 * Removes the objects the deleted `attachments` rows pointed at.
 *
 * Separate and opt-in because it needs the service-role key and talks to a
 * different system — a database reset that half-failed at the Storage step
 * would be worse than one that plainly did not touch it.
 */
async function purgeStorage(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log(
      `\nSkipping the files: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY\n` +
        `are not both set. The database is already clear.\n`,
    );
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let removed = 0;
  // `lead/<id>/…` and `student/<id>/…` — the shape buildStoragePath writes.
  for (const prefix of ["lead", "student"]) {
    const { data: folders, error } = await supabase.storage.from("attachments").list(prefix);
    if (error) {
      console.log(`  could not list ${prefix}/: ${error.message}`);
      continue;
    }
    for (const folder of folders ?? []) {
      const { data: files } = await supabase.storage
        .from("attachments")
        .list(`${prefix}/${folder.name}`);
      const paths = (files ?? []).map((file) => `${prefix}/${folder.name}/${file.name}`);
      if (paths.length === 0) continue;
      const { error: removeError } = await supabase.storage.from("attachments").remove(paths);
      if (removeError) console.log(`  could not remove under ${folder.name}: ${removeError.message}`);
      else removed += paths.length;
    }
  }
  console.log(`\nRemoved ${removed} uploaded file${removed === 1 ? "" : "s"} from Storage.`);
}

/** Never print the password, even into a terminal somebody will screenshot. */
function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.username ? "***@" : ""}${url.host}${url.pathname}`;
  } catch {
    return "(DATABASE_URL is not set)";
  }
}

main().catch((error) => {
  console.error("\nreset failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
