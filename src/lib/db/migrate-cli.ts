/**
 * The deploy's migration step, made to say what happened.
 *
 * ## Why this exists rather than `drizzle-kit migrate`
 *
 * On 2 October 2026 every Vercel deployment started failing after about
 * thirteen seconds, and the entire build log said:
 *
 *     > drizzle-kit migrate && next build
 *     Error: Command "npm run vercel-build" exited with 1
 *
 * That is the whole message. No SQL, no Postgres error, not even whether
 * it had managed to connect. Production sat two days stale while the cause
 * was guessed at, and the guesses were wrong.
 *
 * drizzle-kit is a schema tool whose output is tuned for a developer
 * watching a terminal; it is not an operator's deploy step. This is the
 * same migration run — drizzle-orm's own migrator, reading the same
 * journal and the same `drizzle.__drizzle_migrations` table, so nothing
 * about the mechanism changes — wrapped in the reporting a deploy needs:
 *
 *  - whether the database could be reached at all, said separately from
 *    anything about SQL, because the two have opposite fixes and look
 *    identical from the outside;
 *  - which migrations were already applied and which are about to run,
 *    printed BEFORE running them, so a failure is bounded even if the
 *    process dies without a message;
 *  - the full Postgres error on failure — code, detail, hint, position
 *    and the statement — rather than its first line.
 *
 * Migrations still apply in one transaction and still roll back together.
 * This changes what you are told, not what happens.
 */
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { expectedMigrationTags, pendingMigrationTags } from "./migration-journal";

loadEnv({ path: [".env.local", ".env"] });

const MIGRATIONS_FOLDER = "src/lib/db/migrations";

/** At most 600 characters of SQL — enough to identify the statement. */
function trimStatement(sql: string): string {
  const flat = sql.trim();
  return flat.length > 600 ? `${flat.slice(0, 600)}\n  … (${flat.length} characters in all)` : flat;
}

/**
 * The real error, from under drizzle's wrapper.
 *
 * drizzle's migrator rethrows a failure as `Failed query: <the SQL>` and
 * hangs the Postgres error off `cause`. Printing the top-level message
 * alone gives you the statement and NOT the reason it failed, which is
 * the one thing you needed. So unwrap to the deepest cause carrying a
 * Postgres error code.
 */
function rootPostgresError(error: unknown): Record<string, unknown> | null {
  let current: unknown = error;
  let best: Record<string, unknown> | null = null;

  for (let depth = 0; depth < 10 && typeof current === "object" && current !== null; depth += 1) {
    const e = current as Record<string, unknown>;
    if (typeof e.code === "string" || typeof e.severity === "string") best = e;
    current = e.cause;
  }
  return best;
}

/** Everything Postgres tells you about a failure, not just `message`. */
function describePostgresError(error: unknown): string {
  if (typeof error !== "object" || error === null) return `  ${String(error)}`;

  const top = error as Record<string, unknown>;
  const pg = rootPostgresError(error) ?? top;
  const lines: string[] = [];

  if (typeof pg.message === "string") lines.push(`  ${pg.message}`);
  const say = (label: string, key: string) => {
    const value = pg[key];
    if (value !== undefined && value !== null && value !== "") lines.push(`  ${label}: ${String(value)}`);
  };
  say("code", "code");
  say("detail", "detail");
  say("hint", "hint");
  say("where", "where");
  say("schema", "schema_name");
  say("table", "table_name");
  say("column", "column_name");
  say("constraint", "constraint_name");
  say("routine", "routine");
  say("position", "position");

  // The failing statement, from wherever it survived — postgres.js keeps
  // it on `query`, drizzle puts it in the wrapper's own message. It is the
  // single most useful line and the one drizzle-kit never shows.
  const statement =
    typeof pg.query === "string"
      ? pg.query
      : typeof top.message === "string" && top.message.startsWith("Failed query:")
        ? top.message.slice("Failed query:".length)
        : null;
  if (statement) lines.push(`  statement:\n${trimStatement(statement)}`);

  return lines.join("\n");
}

/**
 * Connection problems and SQL problems need opposite fixes — a changed
 * password versus a broken migration — and from a failed build they look
 * exactly the same. So they are reported as different things.
 */
function isConnectionProblem(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = String((error as { code?: unknown }).code ?? "");
  const message = String((error as { message?: unknown }).message ?? "");
  return (
    // Bad password, no such role, no such database, SSL refused.
    /^(28P01|28000|3D000|08\d{3}|57P03)$/.test(code) ||
    /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|CONNECT_TIMEOUT|ECONNRESET/i.test(code) ||
    /password authentication failed|role .* does not exist|database .* does not exist|connection|timeout/i.test(
      message,
    )
  );
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("\nDATABASE_URL is not set, so there is no database to migrate.");
    console.error("On Vercel this is Settings -> Environment Variables.\n");
    process.exit(1);
  }

  const expected = expectedMigrationTags();
  console.log(`\nMigrations: this build expects ${expected.length}, up to ${expected.at(-1)}.`);

  // `max: 1` because a migration run is strictly sequential, and
  // `prepare: false` for the same reason the app client sets it: a pooled
  // Supabase connection cannot keep prepared statements.
  const client = postgres(url, {
    max: 1,
    prepare: false,
    connect_timeout: 15,
    /**
     * Postgres chatters through 78 migrations — "relation already exists,
     * skipping" and friends — and postgres.js prints every one. A real
     * warning would be lost in it, so NOTICE is dropped and anything
     * louder is kept.
     */
    onnotice: (notice) => {
      if (notice.severity && notice.severity !== "NOTICE") {
        console.warn(`  ${notice.severity}: ${notice.message}`);
      }
    },
  });

  try {
    // Connect first, and on its own, so "cannot reach the database" is
    // never reported as a migration failure.
    try {
      await client`select 1`;
      console.log("Connected to the database.");
    } catch (error) {
      console.error("\nCould not connect to the database. No migration was attempted.");
      console.error(describePostgresError(error));
      console.error(
        "\nThis is a connection problem, not a problem with the migrations themselves.",
      );
      console.error(
        "Check DATABASE_URL — most often the database password was rotated and the deploy",
      );
      console.error("still has the old one, or the Supabase project is paused.\n");
      process.exit(1);
    }

    // What has already run, so the log bounds a failure even if the
    // process dies without saying anything else.
    let applied = 0;
    try {
      const rows = await client<Array<{ count: string }>>`
        select count(*)::text as count from drizzle.__drizzle_migrations
      `;
      applied = Number(rows[0]?.count ?? 0);
    } catch {
      // No `drizzle` schema yet: nothing has ever been migrated here.
      applied = 0;
    }

    const pending = pendingMigrationTags(expected, applied);
    if (pending.length === 0) {
      console.log(`Already up to date (${applied} applied). Nothing to run.\n`);
      return;
    }

    console.log(`Already applied: ${applied}.`);
    // Named when it is a handful, counted when it is a first deploy —
    // seventy-eight tags on one line buries the error underneath it.
    console.log(
      pending.length <= 10
        ? `About to run ${pending.length}: ${pending.join(", ")}`
        : `About to run ${pending.length}, from ${pending[0]} to ${pending.at(-1)}.`,
    );

    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });

    console.log(`Done. ${pending.length} applied, ${expected.length} total.\n`);
  } catch (error) {
    console.error("\nA migration failed. Nothing was applied — they run in one transaction.\n");
    console.error(describePostgresError(error));
    if (isConnectionProblem(error)) {
      console.error("\nThis looks like a connection problem rather than bad SQL. Check DATABASE_URL.");
    }
    console.error("");
    process.exit(1);
  } finally {
    await client.end({ timeout: 5 }).catch(() => {});
  }
}

void main();
