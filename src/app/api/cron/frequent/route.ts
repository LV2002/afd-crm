import { NextResponse } from "next/server";

import { requireCronSecret } from "@/lib/cron/require-secret";
import { runFrequentAndRecord } from "@/lib/cron/run-frequent";
import { reportingFailures } from "@/lib/errors/capture";

export const dynamic = "force-dynamic";

/**
 * The every-few-minutes run: WhatsApp automations, scheduled broadcasts,
 * and the response-time sweep. See `lib/cron/run-frequent.ts` for why
 * those three and not the other seven.
 *
 * ## Not in `vercel.json`, on purpose
 *
 * Vercel's Hobby plan allows one scheduled job a day, which is why the
 * daily run exists in the shape it does. This route is for an *external*
 * caller — a scheduler hitting the URL every ten minutes with the same
 * `Authorization: Bearer $CRON_SECRET` header Vercel's own cron sends.
 * Anything that can make an HTTP request works, and nothing about the
 * hosting plan limits how often a URL may be requested.
 *
 * Adding a second `crons` entry here would be the natural thing to do on
 * a plan that allows it, and nothing in this file would change.
 *
 * ## Overlapping runs
 *
 * Not guarded against, and it does not need to be. The broadcast sweep
 * claims recipients by row status, the automation runner claims a run by
 * its `wake_at` and the partial unique index, and the SLA sweep is
 * idempotent against `sla_escalated_at_hours`. Two of these running at
 * once does no more than waste the second one's time.
 */
export const maxDuration = 300;

async function run(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const result = await runFrequentAndRecord(request);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(request: Request) {
  return reportingFailures("cron:frequent", () => run(request));
}
