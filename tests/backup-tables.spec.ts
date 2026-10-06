/**
 * The order an archive is written and restored in.
 *
 * This is the part of the backup feature that fails *a year later*, in
 * front of somebody trying to recover their data, if it is wrong. The
 * order is computed from the live foreign-key graph precisely so that it
 * cannot drift when a table is added — and that computation is what these
 * tests check, against the real schema rather than a fixture.
 *
 *   npm run db:migrate && npm test
 */
import { config as loadEnv } from "dotenv";
import { describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — see the file header for how to run this suite.");
}

const { archiveTablesInOrder, topologicalOrder, EXCLUDED_TABLES } = await import(
  "../src/lib/backup/tables"
);

describe("topologicalOrder", () => {
  it("puts a parent before its child", () => {
    const order = topologicalOrder(
      new Map([
        ["child", new Set(["parent"])],
        ["parent", new Set<string>()],
      ]),
    );
    expect(order.indexOf("parent")).toBeLessThan(order.indexOf("child"));
  });

  it("is deterministic, so two archives differ only where the data does", () => {
    const build = () =>
      topologicalOrder(
        new Map([
          ["b", new Set<string>()],
          ["a", new Set<string>()],
          ["c", new Set(["a", "b"])],
        ]),
      );
    expect(build()).toEqual(build());
    expect(build().slice(0, 2)).toEqual(["a", "b"]);
  });

  it("refuses a cycle rather than emitting a broken order", () => {
    // No cycle exists today. If one is ever added, this throws at export
    // time in front of whoever added it, instead of at restore time in
    // front of somebody who has already lost their database.
    expect(() =>
      topologicalOrder(
        new Map([
          ["x", new Set(["y"])],
          ["y", new Set(["x"])],
        ]),
      ),
    ).toThrow(/cycle/i);
  });

  it("ignores a parent that is not being archived", () => {
    // `profiles` points at `auth.users`, which no application code can
    // export. An unknown parent must not stall the sort.
    const order = topologicalOrder(new Map([["profiles", new Set(["auth_users"])]]));
    expect(order).toEqual(["profiles"]);
  });
});

describe("archiveTablesInOrder, against the real schema", () => {
  it("covers the schema apart from the deliberate exclusions", async () => {
    const order = await archiveTablesInOrder();
    expect(order.length).toBeGreaterThan(50);
    for (const excluded of EXCLUDED_TABLES) {
      expect(order).not.toContain(excluded);
    }
  });

  it("names every table exactly once", async () => {
    const order = await archiveTablesInOrder();
    expect(new Set(order).size).toBe(order.length);
  });

  it("orders the relationships a restore depends on", async () => {
    const order = await archiveTablesInOrder();
    const at = (table: string) => {
      const index = order.indexOf(table);
      expect(index, `${table} is missing from the archive`).toBeGreaterThanOrEqual(0);
      return index;
    };

    // One per layer of the object model, because getting any of these
    // backwards makes a restore fail on its first insert.
    expect(at("roles")).toBeLessThan(at("profiles"));
    expect(at("centers")).toBeLessThan(at("leads"));
    expect(at("leads")).toBeLessThan(at("enrolments"));
    expect(at("enrolments")).toBeLessThan(at("payments"));
    expect(at("payments")).toBeLessThan(at("receipts"));
    expect(at("tags")).toBeLessThan(at("lead_tags"));
    expect(at("leads")).toBeLessThan(at("lead_tags"));
  });

  it("leaves the operational logs out", async () => {
    // Not a detail: `webhook_events` holds the raw JSON of every delivery
    // Meta has ever made. Including it is the difference between an
    // archive of megabytes and one of hundreds.
    const order = await archiveTablesInOrder();
    expect(order).not.toContain("webhook_events");
    expect(order).not.toContain("error_events");
    expect(order).not.toContain("cron_runs");
  });
});
