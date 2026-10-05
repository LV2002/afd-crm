import { NextResponse } from "next/server";

import { hourlyJobs } from "@/lib/cron/jobs";
import { runTierAndRecord } from "@/lib/cron/record-run";
import { requireCronSecret } from "@/lib/cron/require-secret";
import { reportingFailures } from "@/lib/errors/capture";

export const dynamic = "force-dynamic";

/**
 * Hourly: ad spend from Meta and Google, and the two retargeting
 * audiences pushed back to them.
 *
 * These are the numbers somebody reads during the working day. Once a
 * day means the ROAS figure on the marketing screen is this morning's
 * when it is looked at after lunch, and a lead who enquired at 9am is
 * not in a retargeting audience until tomorrow — so the ad that should
 * follow them around does not, on the day they were actually deciding.
 *
 * Hourly costs 24 calls a day per platform, which is well inside both
 * platforms' quotas. Running these on the ten-minute tier instead would
 * cost 144 and buy nothing: neither platform updates spend that fast,
 * and the audience diff would find nothing new 140 times out of 144.
 *
 * Like the frequent tier, an external caller's route — see that file for
 * why none of this is in `vercel.json`. Every job here is also in the
 * daily run, so an hour's figures are never *lost* if this stops, only
 * late.
 */
export const maxDuration = 300;

async function run(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const result = await runTierAndRecord("hourly", hourlyJobs(request));
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(request: Request) {
  return reportingFailures("cron:hourly", () => run(request));
}
