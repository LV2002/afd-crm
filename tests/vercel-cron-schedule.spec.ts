/**
 * The three schedules live in `vercel.json` now that the project is on a
 * Vercel plan with minute-level cron. This keeps that file honest: every
 * tier must be scheduled, must point at a route that exists, and the
 * ten-minute tier must really be every ten minutes.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const config = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")) as {
  crons?: Array<{ path: string; schedule: string }>;
};

describe("vercel.json crons", () => {
  const crons = config.crons ?? [];

  it("schedules all three tiers", () => {
    expect(crons.map((c) => c.path).sort()).toEqual(
      ["/api/cron/daily", "/api/cron/frequent", "/api/cron/hourly"],
    );
  });

  it("points every entry at a real route", () => {
    for (const cron of crons) {
      const file = join(ROOT, "src", "app", cron.path, "route.ts");
      expect(existsSync(file), `${cron.path} has no route file`).toBe(true);
    }
  });

  it("runs the frequent tier every ten minutes and the hourly one once an hour", () => {
    const by = Object.fromEntries(crons.map((c) => [c.path, c.schedule]));
    expect(by["/api/cron/frequent"]).toBe("*/10 * * * *");
    expect(by["/api/cron/hourly"]).toMatch(/^\d+ \* \* \* \*$/);
  });
});
