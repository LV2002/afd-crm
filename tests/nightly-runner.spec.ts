/**
 * The nightly orchestrator's ordering, isolation and time budget.
 *
 * Pure: the jobs are fakes and the clock is injected, so nothing here waits
 * on a real second or a real database. The cases that matter are the ones
 * that decide whether a broken night looks broken.
 */
import { describe, expect, it } from "vitest";

import { expectOk, runNightly, type NightlyJob } from "@/lib/cron/nightly-runner";

/** A clock the test drives, so a "30 second" job costs no real time. */
function fakeClock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

function job(
  key: string,
  over: Partial<NightlyJob> & { costMs?: number; fail?: string } = {},
  clock?: { advance: (ms: number) => void },
): NightlyJob {
  const cost = over.costMs ?? 0;
  return {
    key,
    label: over.label ?? key,
    estimateMs: over.estimateMs ?? 1000,
    run:
      over.run ??
      (async () => {
        clock?.advance(cost);
        if (over.fail) throw new Error(over.fail);
      }),
  };
}

describe("runNightly", () => {
  it("runs every job in the order given", async () => {
    const order: string[] = [];
    const result = await runNightly({
      budgetMs: 60_000,
      jobs: [
        { key: "a", label: "A", estimateMs: 100, run: async () => void order.push("a") },
        { key: "b", label: "B", estimateMs: 100, run: async () => void order.push("b") },
        { key: "c", label: "C", estimateMs: 100, run: async () => void order.push("c") },
      ],
    });

    expect(order).toEqual(["a", "b", "c"]);
    expect(result.ok).toBe(true);
    expect(result.summary).toEqual({ ok: 3, failed: 0, skipped: 0 });
  });

  it("carries on after a job throws", async () => {
    // Google being down must not stop the response-time sweep from flagging
    // a lead nobody has answered.
    const ran: string[] = [];
    const result = await runNightly({
      budgetMs: 60_000,
      jobs: [
        job("first", {}, undefined),
        {
          key: "broken",
          label: "Broken",
          estimateMs: 100,
          run: async () => {
            throw new Error("Google returned 503");
          },
        },
        { key: "last", label: "Last", estimateMs: 100, run: async () => void ran.push("last") },
      ],
    });

    expect(ran).toEqual(["last"]);
    expect(result.summary).toEqual({ ok: 2, failed: 1, skipped: 0 });
    const broken = result.jobs.find((row) => row.key === "broken")!;
    expect(broken.status).toBe("failed");
    expect(broken.error).toBe("Google returned 503");
  });

  it("is not ok when anything failed, so the platform retries and the alert fires", async () => {
    const result = await runNightly({
      budgetMs: 60_000,
      jobs: [job("fine"), job("broken", { fail: "boom" })],
    });
    expect(result.ok).toBe(false);
  });

  it("reports a non-Error throw without crashing on it", async () => {
    const result = await runNightly({
      budgetMs: 60_000,
      jobs: [
        {
          key: "odd",
          label: "Odd",
          estimateMs: 100,
          run: async () => {
            throw "a string, from some library";
          },
        },
      ],
    });
    expect(result.jobs[0].error).toBe("a string, from some library");
  });

  it("skips a job there is no time to start, rather than starting it", async () => {
    // Half-updating an external audience is worse than not touching it, so
    // the budget stops jobs beginning; it never cuts one off part-way.
    const clock = fakeClock();
    const ran: string[] = [];

    const result = await runNightly({
      budgetMs: 10_000,
      now: clock.now,
      jobs: [
        {
          key: "slow",
          label: "Slow",
          estimateMs: 1000,
          run: async () => {
            ran.push("slow");
            clock.advance(9_500);
          },
        },
        {
          key: "expensive",
          label: "Expensive",
          estimateMs: 5000,
          run: async () => void ran.push("expensive"),
        },
      ],
    });

    expect(ran).toEqual(["slow"]);
    const skipped = result.jobs.find((row) => row.key === "expensive")!;
    expect(skipped.status).toBe("skipped");
    expect(skipped.reason).toMatch(/out of time/);
    // Skipped is not failed: these jobs are incremental and tomorrow covers
    // them, so a short night must not page anybody.
    expect(result.ok).toBe(true);
    expect(result.summary).toEqual({ ok: 1, failed: 0, skipped: 1 });
  });

  it("names how much time was left, so a chronically short run says so", async () => {
    const clock = fakeClock();
    const result = await runNightly({
      budgetMs: 10_000,
      now: clock.now,
      jobs: [
        { key: "eat", label: "Eat", estimateMs: 100, run: async () => clock.advance(8_000) },
        { key: "big", label: "Big", estimateMs: 6000, run: async () => undefined },
      ],
    });

    expect(result.jobs[1].reason).toBe("out of time — 2s left, needs about 6s");
  });

  it("keeps skipping once the budget is gone, without running anything else", async () => {
    const clock = fakeClock();
    const ran: string[] = [];
    const result = await runNightly({
      budgetMs: 5_000,
      now: clock.now,
      jobs: [
        { key: "hog", label: "Hog", estimateMs: 100, run: async () => clock.advance(5_000) },
        job("a", { estimateMs: 1000 }),
        job("b", { estimateMs: 1000 }),
      ],
    });

    expect(ran).toEqual([]);
    expect(result.summary.skipped).toBe(2);
  });

  it("times each job, so a slow one is findable", async () => {
    const clock = fakeClock();
    const result = await runNightly({
      budgetMs: 60_000,
      now: clock.now,
      jobs: [{ key: "a", label: "A", estimateMs: 100, run: async () => clock.advance(2_500) }],
    });
    expect(result.jobs[0].durationMs).toBe(2_500);
    expect(result.durationMs).toBe(2_500);
  });

  it("handles an empty job list", async () => {
    const result = await runNightly({ budgetMs: 1000, jobs: [] });
    expect(result.ok).toBe(true);
    expect(result.jobs).toEqual([]);
    expect(result.summary).toEqual({ ok: 0, failed: 0, skipped: 0 });
  });

  it("stamps when the run started, in ISO", async () => {
    const result = await runNightly({ budgetMs: 1000, jobs: [], now: () => 1_700_000_000_000 });
    expect(result.startedAt).toBe("2023-11-14T22:13:20.000Z");
  });
});

describe("expectOk", () => {
  it("passes a 200 through", async () => {
    await expect(expectOk("Job", new Response("{}", { status: 200 }))).resolves.toBeUndefined();
  });

  it("turns a non-2xx into a throw naming the job and the status", async () => {
    // Every cron route returns a Response rather than throwing, even on
    // failure — so without this a broken job would be recorded as "ok".
    await expect(
      expectOk("Meta ad spend", new Response("upstream exploded", { status: 500 })),
    ).rejects.toThrow(/Meta ad spend returned 500: upstream exploded/);
  });

  it("truncates a long body rather than pasting a page of HTML into the report", async () => {
    let message = "";
    try {
      await expectOk("Job", new Response("x".repeat(5000), { status: 502 }));
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("returned 502");
    expect(message.length).toBeLessThan(400);
  });

  it("treats a 200 carrying an error field as success", async () => {
    // The routes use `{ error: "not configured" }` with a 200 for an
    // integration nobody has set up yet. That is a normal state on a fresh
    // instance, not something to wake anybody for.
    await expect(
      expectOk("Meta retargeting", new Response(JSON.stringify({ error: "not configured" }), { status: 200 })),
    ).resolves.toBeUndefined();
  });
});
