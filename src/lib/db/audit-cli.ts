/**
 * Runs Supabase's database advisors against this schema, and fails if
 * anything new turns up.
 *
 *   npm run db:audit
 *
 * The rules are splinter (`scripts/splinter.sql`), the same engine behind
 * the Security and Performance tabs in the Supabase dashboard. Running them
 * in CI rather than only in the dashboard is the difference between finding
 * out when somebody looks and finding out when somebody pushes.
 *
 * ## What fails the build
 *
 * Any ERROR or WARN that is not on the exemption list below. INFO never
 * fails: those are suggestions whose value depends on traffic the CI
 * database does not have.
 *
 * An exemption needs a reason written next to it. A list of rule names with
 * no explanation becomes a list nobody dares remove.
 */
import "./load-env";

import { readFileSync } from "node:fs";

import { sql } from "drizzle-orm";

import { db } from "./client";

interface Lint {
  name: string;
  title: string;
  level: "ERROR" | "WARN" | "INFO";
  detail: string;
  remediation: string | null;
}

/**
 * Findings this schema is deliberately allowed to produce.
 *
 * Every one of these was investigated, not waved through. The reason is the
 * point: without it, the next person either removes a real exemption or
 * leaves a stale one forever.
 */
const EXEMPT: Record<string, string> = {
  // `integration_credentials` has RLS on and no policy at all, which is the
  // lock working rather than a gap: an absent policy denies everything, and
  // only the service-role key is meant to read Meta and Google secrets.
  // Migration 0022 says so explicitly.
  rls_enabled_no_policy: "Deny-all by design — see migration 0022.",

  // Both are judgement calls about traffic, and CI has none. An index is
  // "unused" on a database nobody has queried, and not every foreign key
  // deserves an index — each costs write throughput. Reviewed from the
  // Supabase dashboard against real usage, not from here.
  unused_index: "Meaningless without production traffic.",
  unindexed_foreign_keys: "Per-column judgement; reviewed against real usage in the dashboard.",
};

/**
 * `splinter.sql` is three statements — a `set`, a `do` block and the query —
 * and a multi-statement execute hands back one result set per statement:
 * `[[], [...rows]]`. Reading it as a flat array of rows finds nothing and
 * reports a clean bill of health, which is the most dangerous way for this
 * particular script to be wrong. So the shape is normalised explicitly.
 */
function rowsOf(result: unknown): Lint[] {
  if (!Array.isArray(result)) return [];
  const nested = result.filter((entry): entry is Lint[] => Array.isArray(entry));
  if (nested.length > 0) return nested.flat();
  return result as Lint[];
}

async function main() {
  const lints = rowsOf(await db.execute(sql.raw(readFileSync("scripts/splinter.sql", "utf8"))));

  // A run that finds literally nothing is far more likely to be a broken
  // reader than a perfect schema — this database has 129 INFO findings and
  // always will. Refuse to report success on an empty result.
  if (lints.length === 0) {
    console.error(
      "db:audit read no findings at all, not even informational ones.\n" +
        "That means the query or the result shape is wrong, not that the schema is clean.\n",
    );
    await db.$client.end();
    process.exit(1);
  }

  const blocking = lints.filter(
    (lint) => (lint.level === "ERROR" || lint.level === "WARN") && !(lint.name in EXEMPT),
  );
  const exempted = lints.filter((lint) => lint.name in EXEMPT);

  const byRule = new Map<string, Lint[]>();
  for (const lint of blocking) {
    const list = byRule.get(lint.name) ?? [];
    list.push(lint);
    byRule.set(lint.name, list);
  }

  if (exempted.length > 0) {
    const counts = new Map<string, number>();
    for (const lint of exempted) counts.set(lint.name, (counts.get(lint.name) ?? 0) + 1);
    console.log("Known and allowed:");
    for (const [name, count] of counts) {
      console.log(`  ${String(count).padStart(4)}  ${name} — ${EXEMPT[name]}`);
    }
    console.log("");
  }

  if (blocking.length === 0) {
    console.log("No new security or performance findings.\n");
    await db.$client.end();
    return;
  }

  console.error(`${blocking.length} finding${blocking.length === 1 ? "" : "s"} to deal with:\n`);
  for (const group of byRule.values()) {
    console.error(`${group[0].level}  ${group[0].title}  (${group.length})`);
    // Five is enough to see the shape of it; the rest are the same thing.
    for (const lint of group.slice(0, 5)) {
      console.error(`    ${lint.detail.replace(/\\`/g, "`").replace(/\s+/g, " ").slice(0, 160)}`);
    }
    if (group.length > 5) console.error(`    …and ${group.length - 5} more`);
    if (group[0].remediation) console.error(`    ${group[0].remediation}`);
    console.error("");
  }
  console.error(
    "If one of these is deliberate, add it to EXEMPT in src/lib/db/audit-cli.ts\n" +
      "with the reason — not because it is noisy, but because it is correct.\n",
  );
  await db.$client.end();
  process.exit(1);
}

main().catch((error) => {
  console.error("db:audit failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
