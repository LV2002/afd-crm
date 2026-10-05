import "server-only";

import { db } from "@/lib/db/client";
import { cronRuns } from "@/lib/db/schema";
import { runNightly, type NightlyJob, type NightlyResult } from "@/lib/cron/nightly-runner";

/**
 * Runs a tier's jobs and writes the run down under its own key.
 *
 * There are three tiers now — every ten minutes, hourly, and the daily
 * safety net — and the first two were each growing their own copy of this
 * function and of `budgetMs()`. Three copies of "insert a cron_runs row,
 * and never let that failure fail the run" is three places for the next
 * column to be forgotten in two of them.
 */
export type CronTier = "frequent" | "hourly" | "daily";

/**
 * How long a run may take.
 *
 * Deliberately low by default. Vercel caps a function at 60 seconds on the
 * Hobby plan whatever `maxDuration` says, and being killed mid-run means no
 * report and no alert — the worst outcome, because the job looks fine. So the
 * default fits inside the smaller cap, and an instance on a plan with room
 * raises it with `CRON_BUDGET_SECONDS`.
 */
export function budgetMs(): number {
  const raw = Number(process.env.CRON_BUDGET_SECONDS);
  const seconds = Number.isFinite(raw) && raw > 0 ? raw : 50;
  return seconds * 1000;
}

export async function runTierAndRecord(
  tier: CronTier,
  jobs: NightlyJob[],
): Promise<NightlyResult> {
  const result = await runNightly({ jobs, budgetMs: budgetMs() });

  // Written down before answering, and never allowed to fail the run.
  //
  // Until this existed the only record of a run was the JSON body handed
  // back to whoever invoked the route, which nobody reads. So "did last
  // night's ad spend sync happen?" had no answer inside the CRM — and the
  // three likeliest reasons it had not (no CRON_SECRET so the call never
  // reached here, a job reporting "not configured", a job skipped for want
  // of time) all look identical from a screen with a missing number on it.
  try {
    await db.insert(cronRuns).values({
      jobKey: tier,
      startedAt: new Date(result.startedAt),
      durationMs: result.durationMs,
      ok: result.ok,
      okCount: result.summary.ok,
      failedCount: result.summary.failed,
      skippedCount: result.summary.skipped,
      jobs: result.jobs as unknown as Array<Record<string, unknown>>,
    });
  } catch (error) {
    // The run happened whether or not it could be recorded. Losing the
    // record is worth a line in the log; losing the run is not.
    console.error(`cron:${tier} could not record its run`, error);
  }

  return result;
}
