import { NextResponse } from "next/server";

import { frequentJobs } from "@/lib/cron/jobs";
import { runTierAndRecord } from "@/lib/cron/record-run";
import { requireCronSecret } from "@/lib/cron/require-secret";
import { reportingFailures } from "@/lib/errors/capture";

export const dynamic = "force-dynamic";

/**
 * Every ten minutes: WhatsApp automations, scheduled broadcasts, and the
 * response-time sweep. See `lib/cron/jobs.ts` for why those three.
 *
 * ## Not in `vercel.json`, on purpose
 *
 * The Hobby plan allows a scheduled job to fire once a day, which is why
 * the daily run exists in the shape it does. This route is for an
 * *external* caller — a scheduler hitting the URL with the same
 * `Authorization: Bearer $CRON_SECRET` header Vercel's own cron sends.
 * Anything that can make an HTTP request works, and nothing about the
 * hosting plan limits how often a URL may be requested. See
 * `docs/CRON-SETUP.md` for the scheduler this instance uses.
 *
 * On a plan with minute-level cron, adding a `crons` entry pointing here
 * is the better answer and nothing in this file changes.
 *
 * ## Overlapping runs
 *
 * Not guarded against, and it does not need to be. The broadcast sweep
 * claims recipients by row status, the automation runner claims a run by
 * its `wake_at` and a partial unique index, and the SLA sweep is
 * idempotent against `sla_escalated_at_hours`. Two of these at once does
 * no more than waste the second one's time — which matters, because a
 * ten-minute schedule and a slow run will overlap eventually.
 */
export const maxDuration = 300;

async function run(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const result = await runTierAndRecord("frequent", frequentJobs(request));
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(request: Request) {
  return reportingFailures("cron:frequent", () => run(request));
}
