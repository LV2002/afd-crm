import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";

/**
 * Which tables an archive holds, and the order they must be written in.
 *
 * ## Why the order is computed, not written down
 *
 * There are 69 tables in `public`, linked by foreign keys. On restore
 * they have to be inserted parents-first or every insert fails, and the
 * obvious implementation — a hand-maintained list — is a list that is
 * correct on the day it is written and silently wrong the first time
 * somebody adds a table and forgets it. The failure would not be subtle,
 * but it would surface a year later, during a restore, which is the
 * worst possible moment to discover a bug.
 *
 * So the order is a topological sort of the live foreign-key graph, read
 * from `pg_constraint`. A new table joins the archive automatically and
 * lands in the right place. This is the "configuration is data" instinct
 * from CLAUDE.md applied to the schema itself: ask the database what it
 * contains rather than keeping a second copy of the answer.
 *
 * ## What is left out, and why
 *
 * Three kinds of table are excluded.
 *
 * **Operational logs.** `webhook_events` keeps the raw JSON of every
 * delivery Meta ever made; `error_events` and `cron_runs` are the health
 * screen's history. These are large, they are about the *running of the
 * system* rather than the institute's records, and nobody restoring a
 * year-old archive wants last year's webhook payloads back. Excluding
 * them is the difference between an archive measured in megabytes and
 * one measured in hundreds.
 *
 * **Drizzle's own migration table.** The schema belongs to the deployed
 * code, not to the data. Restoring a year-old migration history into a
 * newer instance would make the migrator believe work was outstanding
 * that is already applied.
 *
 * **Anything outside `public`.** Supabase Auth lives in `auth`, and no
 * amount of application code can export a password hash — the admin API
 * does not expose them. `profiles` is archived, so who existed and what
 * they could do survives; their logins do not, and a restore means
 * inviting them again. Said plainly on the screen, because a backup that
 * silently omits logins is worse than no backup.
 */

/** Tables whose contents are about running the system, not the institute. */
export const EXCLUDED_TABLES = new Set([
  "webhook_events",
  "error_events",
  "cron_runs",
  "__drizzle_migrations",
  "drizzle_migrations",
]);

export interface ArchiveTable {
  name: string;
  /** Tables this one points at. Empty for a root. */
  dependsOn: string[];
}

/**
 * Every archivable table, parents before children.
 *
 * Self-references (a table with a parent column pointing at itself, like
 * `leads.merged_into_id`) are ignored for ordering: they cannot be
 * satisfied by table order anyway, only by row order within a table, and
 * the import defers them rather than pretending otherwise.
 */
export async function archiveTablesInOrder(): Promise<string[]> {
  const rows = await db.execute<{ child: string; parent: string | null }>(sql`
    select
      c.relname as child,
      pc.relname as parent
    from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_constraint con
        on con.conrelid = c.oid and con.contype = 'f'
      left join pg_class pc on pc.oid = con.confrelid
      left join pg_namespace pn on pn.oid = pc.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and (pn.nspname is null or pn.nspname = 'public')
  `);

  const dependsOn = new Map<string, Set<string>>();
  for (const row of rows) {
    if (EXCLUDED_TABLES.has(row.child)) continue;
    if (!dependsOn.has(row.child)) dependsOn.set(row.child, new Set());
    // A self-reference orders nothing, and a parent we are not archiving
    // (an `auth` table, or an excluded one) cannot be waited for.
    if (row.parent && row.parent !== row.child && !EXCLUDED_TABLES.has(row.parent)) {
      dependsOn.get(row.child)!.add(row.parent);
    }
  }

  return topologicalOrder(dependsOn);
}

/**
 * Kahn's algorithm, with ties broken by name.
 *
 * Deterministic on purpose: two archives of the same database should
 * differ only where the data differs, so that comparing them is useful
 * and a diff is not full of reordering noise.
 *
 * A cycle cannot be ordered — mutually-referencing tables would need
 * deferred constraints to restore. There are none today; if one is ever
 * added this throws at export time, where it is a loud failure in front
 * of whoever added it, rather than at restore time a year later.
 */
export function topologicalOrder(dependsOn: Map<string, Set<string>>): string[] {
  const remaining = new Map<string, Set<string>>();
  for (const [table, parents] of dependsOn) {
    remaining.set(table, new Set([...parents].filter((parent) => dependsOn.has(parent))));
  }

  const ordered: string[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining.entries()]
      .filter(([, parents]) => parents.size === 0)
      .map(([table]) => table)
      .sort((a, b) => a.localeCompare(b));

    if (ready.length === 0) {
      throw new Error(
        `Cannot order these tables for restore — they reference each other in a cycle: ${[...remaining.keys()].sort().join(", ")}`,
      );
    }

    for (const table of ready) {
      ordered.push(table);
      remaining.delete(table);
    }
    for (const parents of remaining.values()) {
      for (const table of ready) parents.delete(table);
    }
  }

  return ordered;
}
