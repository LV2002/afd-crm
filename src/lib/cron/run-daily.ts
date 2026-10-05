import { db } from "@/lib/db/client";
import { cronRuns } from "@/lib/db/schema";
import { expectOk, runNightly, type NightlyJob, type NightlyResult } from "@/lib/cron/nightly-runner";

import { GET as adSpendGoogle } from "@/app/api/cron/ad-spend-sync/google/route";
import { GET as adSpendMeta } from "@/app/api/cron/ad-spend-sync/meta/route";
import { GET as googleConversions } from "@/app/api/cron/google-conversions/route";
import { GET as paymentReminders } from "@/app/api/cron/payment-reminders/route";
import { GET as recomputeTemperature } from "@/app/api/cron/recompute-temperature/route";
import { GET as retargetingGoogle } from "@/app/api/cron/retargeting-sync/google/route";
import { GET as retargetingMeta } from "@/app/api/cron/retargeting-sync/meta/route";
import { GET as slaSweep } from "@/app/api/cron/sla-sweep/route";
import { GET as whatsappBroadcastSweep } from "@/app/api/cron/whatsapp-broadcast-sweep/route";
import { GET as whatsappFlows } from "@/app/api/cron/whatsapp-flows/route";

/**
 * The nightly run, as something other than a route.
 *
 * It lived inside `app/api/cron/daily/route.ts`, which was fine while the
 * schedule was the only caller. It no longer is: an admin can run it from
 * Settings → Platform health, because waiting until 10:00 tomorrow to find
 * out whether a credential is right is not a debugging loop anybody should
 * be asked to use. A route module cannot export the pieces (Next type-checks
 * route files and rejects exports it does not recognise), so they live here
 * and the route is a thin wrapper.
 */

/**
 * How long the run may take.
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

/**
 * Ordered by how fast the value decays, not by what is cheapest.
 *
 * The first three are local table scans that finish in a second or two and
 * are time-critical: an SLA breach flagged tomorrow is a lead already lost,
 * and a payment reminder is a date. The syncs at the end are incremental —
 * tomorrow's run covers what today's did not reach — and they are the ones
 * that get skipped when the budget runs short.
 */
export function nightlyJobs(request: Request): NightlyJob[] {
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
    job("sla-sweep", "Response-time sweep", slaSweep, 4000),
    job("recompute-temperature", "Temperature recalculation", recomputeTemperature, 4000),
    job("payment-reminders", "Fee reminders", paymentReminders, 4000),
    job("retargeting-sync/meta", "Meta retargeting audience", retargetingMeta, 8000),
    job("retargeting-sync/google", "Google retargeting audience", retargetingGoogle, 8000),
    job("whatsapp-flows", "WhatsApp automations", whatsappFlows, 8000),
    job("whatsapp-broadcast-sweep", "Scheduled broadcasts", whatsappBroadcastSweep, 8000),
    job("ad-spend-sync/meta", "Meta ad spend", adSpendMeta, 6000),
    job("ad-spend-sync/google", "Google ad spend", adSpendGoogle, 6000),
    job("google-conversions", "Google offline conversions", googleConversions, 6000),
  ];
}

/**
 * Runs every job and writes the run down.
 *
 * `request` is passed straight through to each sub-route, which re-checks
 * the same secret from its `authorization` header — so whatever authorised
 * the caller authorises the jobs, and no secret is handled here.
 */
export async function runDailyAndRecord(request: Request): Promise<NightlyResult> {
  const result = await runNightly({ jobs: nightlyJobs(request), budgetMs: budgetMs() });

  // Written down before answering, and never allowed to fail the run.
  //
  // Until this existed the only record of a nightly run was the JSON body
  // handed back to whoever invoked the route, which nobody reads. So "did
  // last night's ad spend sync happen?" had no answer inside the CRM —
  // and the three likeliest reasons it had not (no CRON_SECRET so the
  // call never reached here, a job reporting "not configured", a job
  // skipped for want of time) all look identical from a screen with a
  // missing number on it.
  try {
    await db.insert(cronRuns).values({
      jobKey: "daily",
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
    console.error("cron:daily could not record its run", error);
  }

  return result;
}
