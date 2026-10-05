/**
 * What a nightly run reports, and why the reason matters.
 *
 * Leon asked why yesterday's Meta ad spend had not appeared. The CRM could
 * not answer, because a job that ran and did nothing was indistinguishable
 * from a job that ran and worked: both were "ok". The reason is what tells
 * somebody to go and paste in a token rather than read the code.
 */
import { describe, expect, it } from "vitest";

import { expectOk, runNightly, type NightlyJob } from "../src/lib/cron/nightly-runner";

function job(key: string, run: NightlyJob["run"], estimateMs = 10): NightlyJob {
  return { key, label: key, estimateMs, run };
}

describe("expectOk", () => {
  it("passes a plain 200 through with nothing to say", async () => {
    await expect(expectOk("x", Response.json({ ok: true }))).resolves.toBeNull();
  });

  it("keeps a route's own reason for having done nothing", async () => {
    // The ad-spend routes answer this when their credentials are absent.
    // It is a 200 and it is correct — and it is also the likeliest reason
    // a number never appears on a screen.
    await expect(expectOk("Meta ad spend", Response.json({ skipped: "not-configured" }))).resolves.toBe(
      "nothing to do: not-configured",
    );
  });

  it("keeps an error a route reported inside a 200", async () => {
    await expect(expectOk("x", Response.json({ error: "token expired" }))).resolves.toBe(
      "reported: token expired",
    );
  });

  it("says nothing extra for a 200 that is not JSON", async () => {
    await expect(expectOk("x", new Response("fine"))).resolves.toBeNull();
  });

  it("throws on a non-2xx, naming the job and the status", async () => {
    await expect(expectOk("Fee reminders", Response.json({ error: "boom" }, { status: 500 }))).rejects.toThrow(
      /Fee reminders returned 500/,
    );
  });
});

describe("runNightly", () => {
  it("carries each job's reason onto its result", async () => {
    const result = await runNightly({
      budgetMs: 10_000,
      jobs: [
        job("worked", async () => null),
        job("idle", async () => "nothing to do: not-configured"),
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.jobs.find((j) => j.key === "worked")?.reason).toBeUndefined();
    // Without this the panel says "ok" for a job that did nothing, which
    // is the exact ambiguity that made the ad-spend question unanswerable.
    expect(result.jobs.find((j) => j.key === "idle")?.reason).toBe("nothing to do: not-configured");
  });

  it("records a failure with its message and marks the run not ok", async () => {
    const result = await runNightly({
      budgetMs: 10_000,
      jobs: [job("broken", async () => {
        throw new Error("Meta returned 401");
      })],
    });

    expect(result.ok).toBe(false);
    expect(result.summary.failed).toBe(1);
    expect(result.jobs[0].error).toBe("Meta returned 401");
  });

  it("keeps going after one job fails", async () => {
    const result = await runNightly({
      budgetMs: 10_000,
      jobs: [
        job("broken", async () => {
          throw new Error("no");
        }),
        job("later", async () => null),
      ],
    });

    expect(result.summary.failed).toBe(1);
    expect(result.summary.ok).toBe(1);
  });

  it("skips a job it has no time for, and says how much was left", async () => {
    const result = await runNightly({
      budgetMs: 100,
      jobs: [job("huge", async () => null, 5_000)],
    });

    expect(result.jobs[0].status).toBe("skipped");
    expect(result.jobs[0].reason).toContain("out of time");
    // A skip is not a failure: it is incremental work tomorrow covers.
    expect(result.ok).toBe(true);
  });
});
