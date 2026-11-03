import { NextResponse } from "next/server";

import { requireCronSecret } from "@/lib/cron/require-secret";
import { reportingFailures } from "@/lib/errors/capture";
import { getOutcomeCredentials, queueOutcomes, sendPendingOutcomes } from "@/lib/outcomes/publish";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Reports status changes on website enquiries to the marketing sheet.
 *
 * Queues first even when the sheet is not connected yet, so connecting it
 * later sends the recent changes rather than starting from nothing. A
 * refusal from the sheet is a 502 so it shows on Platform health; the
 * events stay pending and the next run tries again.
 */
async function run(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const queue = await queueOutcomes();
  const { execUrl, secret } = await getOutcomeCredentials();
  if (!execUrl || !secret) return NextResponse.json({ ...queue, skipped: "not connected" });

  const sent = await sendPendingOutcomes({ execUrl, secret });
  return NextResponse.json({ ...queue, ...sent }, { status: sent.error ? 502 : 200 });
}

export async function GET(request: Request) {
  return reportingFailures("cron:outcome-report", () => run(request));
}
