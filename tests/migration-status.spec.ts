/**
 * Does the running build know which migrations it needs?
 *
 * The journal is hand-edited in this project — new migrations are appended
 * to `meta/_journal.json` by hand — so "wrote the .sql, forgot the journal
 * entry" is a real and silent failure: the migration never runs anywhere,
 * including production.
 */
import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// From the journal module, not `migration-status` — these are pure, and a
// test that only reads a JSON file has no business opening a connection
// pool to do it.
import { expectedMigrationTags, pendingMigrationTags } from "../src/lib/db/migration-journal";

describe("expectedMigrationTags", () => {
  it("names one migration per .sql file on disk, in order", () => {
    const dir = path.join(process.cwd(), "src/lib/db/migrations");
    const files = readdirSync(dir)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => name.replace(/\.sql$/, ""))
      .sort();

    const tags = expectedMigrationTags();

    // A file with no journal entry never runs; a journal entry with no
    // file makes `drizzle-kit migrate` fail outright on every deploy.
    expect([...tags].sort()).toEqual(files);
    expect(tags).toEqual([...tags].sort());
  });
});

describe("pendingMigrationTags", () => {
  const expected = ["0000_a", "0001_b", "0002_c"];

  it("names exactly what has not run, because 'something is behind' is not actionable", () => {
    expect(pendingMigrationTags(expected, 1)).toEqual(["0001_b", "0002_c"]);
    expect(pendingMigrationTags(expected, 0)).toEqual(expected);
  });

  it("is quiet when the database is level", () => {
    expect(pendingMigrationTags(expected, 3)).toEqual([]);
  });

  it("is quiet when the database is AHEAD — that is a deploy in flight, not a fault", () => {
    expect(pendingMigrationTags(expected, 4)).toEqual([]);
  });
});
