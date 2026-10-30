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
 * ## Scheduled by Vercel
 *
 * `vercel.json` runs this every ten minutes. That needs a Vercel plan with
 * minute-level cron (Pro); on the Hobby plan, which allows one run a day,
 * this route was instead called by an outside scheduler with the same
 * `Authorization: Bearer $CRON_SECRET` header Vercel's own cron sends — see
 * `docs/CRON-SETUP.md`. Either caller works, because the route only checks
 * that header.
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
