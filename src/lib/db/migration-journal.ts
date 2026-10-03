import journal from "./migrations/meta/_journal.json";

/**
 * Which migrations a build expects, read from the journal it ships with.
 *
 * Deliberately free of `server-only` and of any database import, so the
 * same answer is available to a Server Component, to a command-line tool
 * run by `npm run db:migrate`, and to a test — without any of them opening
 * a connection pool to find out.
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
 * `applied` greater than expected is not an error to report: it means the
 * database is AHEAD, which happens routinely while a deploy is in flight
 * and resolves itself seconds later. Only being behind is a fault.
 */
export function pendingMigrationTags(expected: string[], applied: number): string[] {
  if (applied >= expected.length) return [];
  return expected.slice(Math.max(0, applied));
}
