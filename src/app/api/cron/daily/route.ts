import { NextResponse } from "next/server";

import { requireCronSecret } from "@/lib/cron/require-secret";
import { runDailyAndRecord } from "@/lib/cron/run-daily";
import { reportingFailures } from "@/lib/errors/capture";

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
 * The jobs themselves live in `lib/cron/run-daily.ts`, because the schedule
 * is no longer the only caller: an admin can run them from Settings →
 * Platform health.
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

async function run(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const result = await runDailyAndRecord(request);

  // A failed job means a non-2xx, so the platform retries and the alert
  // email fires. Skipped jobs are not failures — they are incremental and
  // tomorrow's run covers them — but they do show up in the body, so a run
  // that is consistently short of time is visible rather than silent.
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(request: Request) {
  return reportingFailures("cron:daily", () => run(request));
}
