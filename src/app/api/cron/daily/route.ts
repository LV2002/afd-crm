import { NextResponse } from "next/server";

import { requireCronSecret } from "@/lib/cron/require-secret";
import { expectOk, runNightly, type NightlyJob } from "@/lib/cron/nightly-runner";
import { reportingFailures } from "@/lib/errors/capture";

import { GET as adSpendGoogle } from "../ad-spend-sync/google/route";
import { GET as adSpendMeta } from "../ad-spend-sync/meta/route";
import { GET as googleConversions } from "../google-conversions/route";
import { GET as paymentReminders } from "../payment-reminders/route";
import { GET as recomputeTemperature } from "../recompute-temperature/route";
import { GET as retargetingGoogle } from "../retargeting-sync/google/route";
import { GET as retargetingMeta } from "../retargeting-sync/meta/route";
import { GET as slaSweep } from "../sla-sweep/route";
import { GET as whatsappBroadcastSweep } from "../whatsapp-broadcast-sweep/route";
import { GET as whatsappFlows } from "../whatsapp-flows/route";

export const dynamic = "force-dynamic";

/**
 * The one scheduled job.
 *
 * `vercel.json` has a single cron entry pointing here, and this calls every
 * other cron route in turn. See `lib/cron/nightly-runner.ts` for why — in
 * short, the ten routes were spread across different days of the week to fit
 * inside a plan that allows very few scheduled jobs, which made retargeting
 * weekly and left two routes never scheduled at all.
 *
 * Each route is called **in process**, not over HTTP: an extra network hop to
 * localhost would cost a serverless invocation per job and could not be
 * authenticated without minting a second request. They are ordinary async
 * functions taking a `Request`, and `requireCronSecret` reads only the
 * `authorization` header — so this handler's own already-verified request is
 * passed straight through and each route re-checks the same secret. No
 * synthetic request, no secret handling here.
 *
 * Every one of these routes stays independently callable. Hitting
 * `/api/cron/retargeting-sync/meta` by hand with the secret still works,
 * which is how you test one in isolation without waiting for the night.
 *
 * ## Why 10:00 IST, and what a single daily run costs
 *
 * `vercel.json` runs this at 04:30 UTC — 10:00 in Kerala. The retargeting
 * sync only needs to happen once every 24 hours for a lead who arrived
 * yesterday to be in the audience today, so the hour is free to suit the one
 * job here with a human on the other end: a broadcast that came due
 * overnight goes out mid-morning rather than at 1am.
 *
 * The cost is honest and worth writing down: on one run a day, a broadcast
 * scheduled for 3pm waits until 10am the next morning. That is a property of
 * having a single slot, not of this code — **the same route run hourly gives
 * retargeting and broadcasts within the hour, with no change here at all.**
 * If the hosting plan allows more than one scheduled job a day, change the
 * cron expression and nothing else.
 */
export const maxDuration = 300;

/**
 * How long the run may take.
 *
 * Deliberately low by default. Vercel caps a function at 60 seconds on the
 * Hobby plan whatever `maxDuration` says, and being killed mid-run means no
 * report and no alert — the worst outcome, because the job looks fine. So the
 * default fits inside the smaller cap, and an instance on a plan with room
 * raises it with `CRON_BUDGET_SECONDS`.
 */
function budgetMs(): number {
  const raw = Number(process.env.CRON_BUDGET_SECONDS);
  const seconds = Number.isFinite(raw) && raw > 0 ? raw : 50;
  return seconds * 1000;
}

/**
 * Ordered by how fast the value decays, not by what is cheapest.
 *
 * The first three are local table scans that finish in a second or two and
 * are time-critical: an SLA breach flagged tomorrow is a lead already lost,
 * and a payment reminder is a date.
 *
 * Retargeting comes next, ahead of everything that talks to an external API
 * for reporting purposes, because this is the job whose whole point is
 * same-day freshness — a lead who arrives today should see an ad tomorrow.
 *
 * Spend reporting and offline conversion upload come last. Those feed
 * dashboards and platform bidding models where a day's lag changes nothing,
 * and they are the ones that get skipped when the budget runs short.
 */
function nightlyJobs(request: Request): NightlyJob[] {
  const job = (
    key: string,
    label: string,
    handler: (request: Request) => Promise<Response>,
    estimateMs: number,
  ): NightlyJob => ({
    key,
    label,
    estimateMs,
    run: async () => {
      await expectOk(label, await handler(request));
    },
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

async function run(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const result = await runNightly({ jobs: nightlyJobs(request), budgetMs: budgetMs() });

  // A failed job means a non-2xx, so the platform retries and the alert
  // email fires. Skipped jobs are not failures — they are incremental and
  // tomorrow's run covers them — but they do show up in the body, so a run
  // that is consistently short of time is visible rather than silent.
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(request: Request) {
  return reportingFailures("cron:daily", () => run(request));
}
