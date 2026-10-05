import { NextResponse } from "next/server";

import { dailyJobs } from "@/lib/cron/jobs";
import { runTierAndRecord } from "@/lib/cron/record-run";
import { requireCronSecret } from "@/lib/cron/require-secret";
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
 * The jobs themselves live in `lib/cron/jobs.ts`, because the schedule is
 * no longer the only caller: an admin runs them from Settings → Platform
 * health, and two other tiers share the same list.
 *
 * ## Why 10:00 IST, and what this tier is for now
 *
 * `vercel.json` runs this at 04:30 UTC — 10:00 in Kerala. The retargeting
 * sync only needs to happen once every 24 hours for a lead who arrived
 * yesterday to be in the audience today, so the hour is free to suit the one
 * job here with a human on the other end: a broadcast that came due
 * overnight goes out mid-morning rather than at 1am.
 *
 * This is no longer the only schedule. Two faster tiers —
 * `/api/cron/frequent` every ten minutes and `/api/cron/hourly` — now
 * carry the jobs whose value decays inside a day, called by a scheduler
 * outside the deployment. What is left that only runs here is the work
 * that *should* happen once, at a civilised hour: fee reminders,
 * temperature recalculation, and Google's offline conversion batch.
 *
 * It still runs everything, including both faster tiers' jobs. Those
 * tiers live outside the app and can be absent, disabled or quietly
 * broken; this one ships in `vercel.json` and has to work. With it as a
 * safety net the worst case of any scheduler failure is the once-a-day
 * behaviour this system had before the tiers existed.
 */
export const maxDuration = 300;

async function run(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const result = await runTierAndRecord("daily", dailyJobs(request));

  // A failed job means a non-2xx, so the platform retries and the alert
  // email fires. Skipped jobs are not failures — they are incremental and
  // tomorrow's run covers them — but they do show up in the body, so a run
  // that is consistently short of time is visible rather than silent.
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(request: Request) {
  return reportingFailures("cron:daily", () => run(request));
}
