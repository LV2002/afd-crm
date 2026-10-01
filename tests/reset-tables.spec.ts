/**
 * Every table is either configuration or data — no table is unclassified.
 *
 * This is the whole safety property of the reset tool. A table added in a
 * later migration and classified as neither would be left behind by a
 * reset, full of rows pointing at leads that no longer exist: an
 * `interactions` table surviving a wipe of `leads` is a database that
 * cannot be opened. The script refuses to run in that case, and this test
 * is what makes somebody notice before they are standing at the terminal
 * the day before launch.
 *
 *   npm run db:migrate && npm test
 */
import { config as loadEnv } from "dotenv";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set — see the file header.");

const { db } = await import("../src/lib/db/client");
const { CONFIG_TABLES, DATA_TABLES, UNOWNED_SEQUENCES } = await import(
  "../src/lib/db/reset-tables"
);

async function liveTables(): Promise<string[]> {
  const rows = await db.execute<{ tablename: string }>(sql`
    select tablename from pg_tables where schemaname = 'public' order by tablename
  `);
  return rows.map((row) => row.tablename);
}

describe("the reset classification", () => {
  it("covers every table in the database", async () => {
    const live = await liveTables();
    const classified = new Set<string>([...CONFIG_TABLES, ...DATA_TABLES]);
    const missing = live.filter((table) => !classified.has(table));

    expect(
      missing,
      "add each of these to CONFIG_TABLES or DATA_TABLES in src/lib/db/reset-tables.ts",
    ).toEqual([]);
  });

  it("names no table that does not exist", async () => {
    // A renamed table left on the list would make the script truncate
    // something that is not there, which fails loudly — but a typo on the
    // CONFIG list fails silently, by protecting nothing.
    const live = new Set(await liveTables());
    const ghosts = [...CONFIG_TABLES, ...DATA_TABLES].filter((table) => !live.has(table));
    expect(ghosts).toEqual([]);
  });

  it("never puts a table in both lists", () => {
    const data = new Set<string>(DATA_TABLES);
    expect(CONFIG_TABLES.filter((table) => data.has(table))).toEqual([]);
  });

  it("keeps the things that are not ours to delete", () => {
    // Each of these has a reason written beside it in reset-tables.ts, and
    // each would be an easy, costly mistake to reclassify.
    for (const table of [
      // Messaging somebody who replied STOP is a consent problem no amount
      // of "we were testing" repairs.
      "whatsapp_suppressions",
      // The people who work here.
      "profiles",
      "user_centers",
      "roles",
      "role_permissions",
      // The bank accounts and their opening balances. The transactions go.
      "finance_accounts",
      // The backups that could undo a reset.
      "config_snapshots",
      // Class groups — Leon set these up in Settings.
      "batches",
    ]) {
      expect(CONFIG_TABLES as readonly string[], `${table} must survive a reset`).toContain(table);
    }
  });

  it("clears the things a fresh start means", () => {
    for (const table of [
      "leads",
      "enquiries",
      "interactions",
      "enrolments",
      "payments",
      "receipts",
      // "the bank entries", in Leon's words.
      "finance_transactions",
      "students",
      "attachments",
      "whatsapp_messages",
      "tasks",
      "notifications",
    ]) {
      expect(DATA_TABLES as readonly string[], `${table} must be cleared`).toContain(table);
    }
  });

  it("resets the one sequence that nothing else resets", async () => {
    // TRUNCATE ... RESTART IDENTITY only resets a sequence OWNED by a
    // truncated column. `student_code_seq` is standalone (migration 0017
    // sets it as a default expression), so without this the first real
    // student is coded STU000014.
    const rows = await db.execute<{ sequencename: string }>(sql`
      select s.sequencename from pg_sequences s
      where s.schemaname = 'public'
        and not exists (
          select 1 from pg_depend d
          join pg_class c on c.oid = d.objid
          where c.relname = s.sequencename and d.deptype = 'a'
        )
    `);
    const unowned = rows.map((row) => row.sequencename).sort();
    expect(unowned).toEqual([...UNOWNED_SEQUENCES].sort());
  });
});
