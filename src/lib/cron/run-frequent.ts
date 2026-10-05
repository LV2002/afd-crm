import { db } from "@/lib/db/client";
import { cronRuns } from "@/lib/db/schema";
import { expectOk, runNightly, type NightlyJob, type NightlyResult } from "@/lib/cron/nightly-runner";

import { GET as slaSweep } from "@/app/api/cron/sla-sweep/route";
import { GET as whatsappBroadcastSweep } from "@/app/api/cron/whatsapp-broadcast-sweep/route";
import { GET as whatsappFlows } from "@/app/api/cron/whatsapp-flows/route";

/**
 * The jobs that are worth running every few minutes, and only those.
 *
 * ## Why this exists
 *
 * Two of the ten nightly jobs are not really nightly work at all — they
 * are a queue being drained. Nothing a broadcast or an automation sends
 * leaves the building until a sweep picks it up, so on one run a day a
 * counsellor who presses Send at 2pm has their messages go out at 10:00
 * the next morning, and the first message of a "new enquiry" automation
 * reaches somebody up to 24 hours after they enquired. Leon asked the
 * right question about this: for those two, the schedule *is* the
 * feature.
 *
 * ## Why not simply run the whole daily job more often
 *
 * It is the obvious move and it is wrong. Four of the ten jobs talk to
 * Meta and Google — ad spend, two retargeting audience pushes, offline
 * conversion uploads — and running them 144 times a day instead of once
 * spends API quota on data that does not change that fast, re-pushes
 * audiences that are already correct, and re-presents conversions that
 * were already uploaded. Two more are cheap but pointless at this
 * cadence: a fee reminder is a *date*, and sending it at 03:10 because
 * that is when a sweep happened to run is worse than sending it at ten
 * in the morning. Temperature is a slow signal by definition.
 *
 * So the split is by *what the job is*, not by what it costs:
 *
 *   **here** — draining a queue, or flagging something whose value decays
 *   in minutes
 *   **daily** — pushing to an external platform, or anything a human
 *   reads at a civilised hour
 *
 * The SLA sweep joins the first group because it is a local table scan
 * that finishes in seconds and because a breach found tomorrow is a lead
 * already lost. It is idempotent by construction — `sla_escalated_at_hours`
 * is the floor that stops a rung firing twice — so running it every ten
 * minutes notifies nobody twice.
 *
 * Every job here is also in the daily run. That is deliberate: if the
 * frequent schedule is never set up, or stops, nothing is lost that a
 * day's delay does not cover, and the daily run remains the one thing
 * that has to work.
 */
export function frequentJobs(request: Request): NightlyJob[] {
  const job = (
    key: string,
    label: string,
    handler: (request: Request) => Promise<Response>,
    estimateMs: number,
  ): NightlyJob => ({
    key,
    label,
    estimateMs,
    run: async () => expectOk(label, await handler(request)),
  });

  return [
    // First, because it is the one with somebody waiting on it.
    job("whatsapp-flows", "WhatsApp automations", whatsappFlows, 8000),
    job("whatsapp-broadcast-sweep", "Scheduled broadcasts", whatsappBroadcastSweep, 8000),
    job("sla-sweep", "Response-time sweep", slaSweep, 4000),
  ];
}

/**
 * Runs them and writes the run down under its own job key.
 *
 * Recorded separately from `daily` so Settings → Platform health can
 * answer two different questions — "did last night's run happen?" and
 * "is the frequent schedule actually calling us?" — which have different
 * answers and different fixes. A frequent schedule that was never set up
 * and one that is being turned away at the door look identical from a
 * broadcast that has not gone out.
 */
export async function runFrequentAndRecord(request: Request): Promise<NightlyResult> {
  const result = await runNightly({ jobs: frequentJobs(request), budgetMs: budgetMs() });

  try {
    await db.insert(cronRuns).values({
      jobKey: "frequent",
      startedAt: new Date(result.startedAt),
      durationMs: result.durationMs,
      ok: result.ok,
      okCount: result.summary.ok,
      failedCount: result.summary.failed,
      skippedCount: result.summary.skipped,
      jobs: result.jobs as unknown as Array<Record<string, unknown>>,
    });
  } catch (error) {
    // The run happened whether or not it could be recorded.
    console.error("cron:frequent could not record its run", error);
  }

  return result;
}

/**
 * The same budget rule as the daily run, for the same reason: being
 * killed mid-run by the platform's function cap means no report and no
 * alert, which is the one outcome worse than a slow job.
 */
function budgetMs(): number {
  const raw = Number(process.env.CRON_BUDGET_SECONDS);
  const seconds = Number.isFinite(raw) && raw > 0 ? raw : 50;
  return seconds * 1000;
}
