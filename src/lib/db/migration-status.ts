import "server-only";

import { sql } from "drizzle-orm";

import journal from "./migrations/meta/_journal.json";

import { db } from "./client";

/**
 * Whether the live database has had every migration this build expects.
 *
 * ## Why this is worth a screen
 *
 * `vercel-build` runs `drizzle-kit migrate && next build`. drizzle-kit
 * applies every pending migration inside ONE transaction and — this is the
 * part that bites — does not always surface a failure as a non-zero exit.
 * The build then succeeds, the new code deploys, and it is talking to a
 * database that is one or more migrations behind it.
 *
 * What that looks like from the outside is a screen that worked yesterday
 * throwing `column leads.x does not exist`, on one page, for one action,
 * with nothing in the deploy log to suggest anything went wrong. It is the
 * single most likely cause of "it works locally" in this project, and
 * until now there was no way to check it short of opening a SQL console.
 *
 * ## How it knows
 *
 * `meta/_journal.json` ships inside the build, so the running code carries
 * the exact list of migrations it was written against. `drizzle`'s own
 * `__drizzle_migrations` table says what the database has actually run.
 * Migrations are applied strictly in journal order, so the count is enough
 * to name precisely which ones are missing.
 *
 * Note the table lives in the `drizzle` schema, not `public` — dropping
 * `public` alone leaves it behind, which is its own afternoon.
 */

interface JournalEntry {
  idx: number;
  tag: string;
}

/** Every migration this build was compiled against, in the order they apply. */
export function expectedMigrationTags(): string[] {
  const entries = (journal as { entries?: JournalEntry[] }).entries ?? [];
  return [...entries].sort((a, b) => a.idx - b.idx).map((entry) => entry.tag);
}

/**
 * The migrations the database has not run yet.
 *
 * `applied` greater than expected is not an error to report here: it means
 * the database is AHEAD, which happens routinely while a deploy is in
 * flight and resolves itself seconds later. Only being behind is a fault.
 */
export function pendingMigrationTags(expected: string[], applied: number): string[] {
  if (applied >= expected.length) return [];
  return expected.slice(Math.max(0, applied));
}

export interface MigrationStatus {
  expected: number;
  applied: number | null;
  /** Named, so the fix is "run 0077" rather than "something is behind". */
  pending: string[];
  /** Set when the check itself could not run. Never a reason to fail a page. */
  error: string | null;
}

export async function getMigrationStatus(): Promise<MigrationStatus> {
  const expected = expectedMigrationTags();

  try {
    const result = await db.execute<{ applied: string | number }>(
      sql`select count(*)::int as applied from drizzle.__drizzle_migrations`,
    );
    // `db.execute` returns rows directly for node-postgres and a result
    // object for others; both shapes are handled rather than assumed.
    const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
    const first = rows[0] as { applied?: string | number } | undefined;
    const applied = Number(first?.applied ?? NaN);

    if (!Number.isFinite(applied)) {
      return { expected: expected.length, applied: null, pending: [], error: "No migration record found." };
    }

    return {
      expected: expected.length,
      applied,
      pending: pendingMigrationTags(expected, applied),
      error: null,
    };
  } catch (error) {
    // A missing `drizzle` schema means migrations have never run here at
    // all, which is worth saying plainly rather than crashing the health
    // screen that exists to tell somebody things are wrong.
    return {
      expected: expected.length,
      applied: null,
      pending: [],
      error: error instanceof Error ? error.message : "Could not read the migration record.",
    };
  }
}
