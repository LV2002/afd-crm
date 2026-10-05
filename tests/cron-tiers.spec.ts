/**
 * The three schedules: their job lists, and reading back the last run of each.
 *
 * Two different risks here.
 *
 * The **job lists** are a design decision that is easy to erode. Putting
 * the ad-spend sync on the ten-minute tier would send 144 requests a day
 * to Meta instead of 24 and buy nothing; dropping the broadcast sweep
 * from it would silently restore the once-a-day delay the tiers exist to
 * fix. Neither breaks a type or a test unless something asserts the
 * membership, so this does.
 *
 * The **query** is `selectDistinctOn`, which compiles to Postgres's
 * `distinct on` and has a rule the type checker cannot enforce: the first
 * ORDER BY column must be the distinct column, or Postgres rejects it.
 * The health screen is the one screen somebody opens when things are
 * already wrong, so it throwing there is the worst place for it.
 *
 *   npm run db:migrate && npm test
 */
import { config as loadEnv } from "dotenv";
import { desc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — see the file header for how to run this suite.");
}

const { dailyJobs, frequentJobs, hourlyJobs } = await import("../src/lib/cron/jobs");
const { db } = await import("../src/lib/db/client");
const { cronRuns } = await import("../src/lib/db/schema");

const request = new Request("https://cron.local/test", {
  headers: { authorization: "Bearer not-used-these-are-never-run" },
});

const keysOf = (jobs: ReturnType<typeof frequentJobs>) => jobs.map((job) => job.key);

describe("what belongs on which schedule", () => {
  it("puts the three queue-draining jobs on the frequent tier, and only those", () => {
    // Anything that talks to Meta or Google landing here means 144 calls
    // a day in place of 24, for data that does not change that fast.
    expect(keysOf(frequentJobs(request)).sort()).toEqual([
      "sla-sweep",
      "whatsapp-broadcast-sweep",
      "whatsapp-flows",
    ]);
  });

  it("puts spend and audiences on the hourly tier", () => {
    expect(keysOf(hourlyJobs(request)).sort()).toEqual([
      "ad-spend-sync/google",
      "ad-spend-sync/meta",
      "retargeting-sync/google",
      "retargeting-sync/meta",
    ]);
  });

  it("keeps fee reminders off the faster tiers", () => {
    // A reminder is a date. Sending it at 03:10 because that is when a
    // sweep fired is worse than sending it at ten in the morning.
    const faster = [...keysOf(frequentJobs(request)), ...keysOf(hourlyJobs(request))];
    expect(faster).not.toContain("payment-reminders");
    expect(faster).not.toContain("recompute-temperature");
    expect(faster).not.toContain("google-conversions");
  });

  it("runs everything on the daily tier, as the safety net", () => {
    // The faster tiers live outside the deployment and can be absent or
    // broken. If this ever stops being a superset, a scheduler failure
    // starts losing work instead of merely delaying it.
    const daily = keysOf(dailyJobs(request));
    for (const key of [...keysOf(frequentJobs(request)), ...keysOf(hourlyJobs(request))]) {
      expect(daily).toContain(key);
    }
    expect(daily).toContain("payment-reminders");
    expect(daily).toContain("recompute-temperature");
    expect(daily).toContain("google-conversions");
  });

  it("names every job exactly once per tier", () => {
    for (const jobs of [frequentJobs(request), hourlyJobs(request), dailyJobs(request)]) {
      const keys = keysOf(jobs);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("gives every job a human label and a positive estimate", () => {
    // The label is what appears in an alert email and on the health
    // screen; the estimate is what the budget check reads, and a zero
    // would make a job look free and always worth starting.
    for (const job of dailyJobs(request)) {
      expect(job.label).toBeTruthy();
      expect(job.label).not.toBe(job.key);
      expect(job.estimateMs).toBeGreaterThan(0);
    }
  });
});

describe("the last run of each tier", () => {
  const started = new Date("2026-10-05T04:30:00Z");

  async function sweep() {
    await db.delete(cronRuns).where(inArray(cronRuns.durationMs, [111, 222, 333]));
  }

  beforeAll(async () => {
    await sweep();
    await db.insert(cronRuns).values([
      // Two frequent runs, so "newest per tier" has something to choose.
      { jobKey: "frequent", startedAt: started, durationMs: 111, ok: true, okCount: 3, jobs: [] },
      {
        jobKey: "frequent",
        startedAt: new Date(started.getTime() + 600_000),
        durationMs: 222,
        ok: true,
        okCount: 3,
        jobs: [],
      },
      { jobKey: "hourly", startedAt: started, durationMs: 333, ok: true, okCount: 4, jobs: [] },
    ]);
  });

  afterAll(sweep);

  it("returns one row per tier, newest first", async () => {
    const rows = await db
      .selectDistinctOn([cronRuns.jobKey])
      .from(cronRuns)
      .orderBy(cronRuns.jobKey, desc(cronRuns.startedAt));

    const keys = rows.map((row) => row.jobKey);
    expect(new Set(keys).size).toBe(keys.length);

    const frequent = rows.find((row) => row.jobKey === "frequent");
    // The newer of the two fixtures, not the older. `distinct on` keeps
    // the first row of each group, which is only the newest because of
    // the second ORDER BY term.
    expect(frequent?.durationMs).toBe(222);
  });

  it("records a tier under its own key", async () => {
    const hourly = await db
      .select()
      .from(cronRuns)
      .where(eq(cronRuns.durationMs, 333));
    expect(hourly).toHaveLength(1);
    expect(hourly[0].jobKey).toBe("hourly");
  });
});
