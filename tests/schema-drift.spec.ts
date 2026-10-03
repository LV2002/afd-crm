/**
 * Does the database have the shape the code expects?
 *
 * The pure half pins the comparison. The database half is the one that
 * matters: it runs the real check against a real migrated database, so a
 * Drizzle column that no migration ever creates fails the build instead of
 * failing a counsellor's screen.
 *
 * Needs a migrated database: `npm run db:migrate && npm test`.
 */
import { config as loadEnv } from "dotenv";
import { describe, expect, it } from "vitest";

import { compareSchema, describeDifference } from "../src/lib/db/schema-compare";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

describe("compareSchema", () => {
  const expected = [
    { name: "leads", columns: ["id", "assigned_to", "assigned_at"] },
    { name: "promos", columns: ["id", "code"] },
  ];

  it("says nothing when the database matches", () => {
    const actual = new Map([
      ["leads", new Set(["id", "assigned_to", "assigned_at"])],
      ["promos", new Set(["id", "code"])],
    ]);
    expect(compareSchema(expected, actual)).toEqual({ missingTables: [], missingColumns: [] });
    expect(describeDifference(compareSchema(expected, actual))).toBeNull();
  });

  it("names the column that took production down on 3 October", () => {
    const actual = new Map([
      ["leads", new Set(["id", "assigned_to"])],
      ["promos", new Set(["id", "code"])],
    ]);
    const difference = compareSchema(expected, actual);
    expect(difference.missingColumns).toEqual([{ table: "leads", column: "assigned_at" }]);
    expect(describeDifference(difference)).toBe("1 missing column (leads.assigned_at)");
  });

  it("reports a missing table once, not once per column", () => {
    const actual = new Map([["leads", new Set(["id", "assigned_to", "assigned_at"])]]);
    const difference = compareSchema(expected, actual);
    expect(difference.missingTables).toEqual(["promos"]);
    expect(difference.missingColumns).toEqual([]);
  });

  it("ignores columns the database has and the code does not — those are harmless", () => {
    const actual = new Map([
      ["leads", new Set(["id", "assigned_to", "assigned_at", "some_old_column"])],
      ["promos", new Set(["id", "code"])],
    ]);
    expect(compareSchema(expected, actual).missingColumns).toEqual([]);
  });
});

describe("the real schema, against the real database", () => {
  it("declares no table or column the migrations do not create", async () => {
    const { getSchemaDrift } = await import("../src/lib/db/schema-drift");
    const drift = await getSchemaDrift();

    expect(drift.error).toBeNull();
    expect(drift.tablesChecked).toBeGreaterThan(20);
    // If this fails, the Drizzle schema and the migrations have diverged —
    // which is exactly the production outage this test exists to prevent.
    expect(describeDifference(drift)).toBeNull();
  });
});
