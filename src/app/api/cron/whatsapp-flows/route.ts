import { NextResponse } from "next/server";
import { reportingFailures } from "@/lib/errors/capture";

import { advanceRuns } from "@/lib/whatsapp/flow-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Moves every automation flow run whose wait is over.
 *
 * This is a route of its own — testable, callable by hand, and the right
 * place for this to live — but it is deliberately NOT in `vercel.json`.
 * AFD's hosting plan allows one cron a day at most and they are all
 * spoken for, so the broadcast sweep calls `advanceRuns()` directly and
 * flows advance on that schedule. The day the plan allows another cron,
 * pointing it here is the whole change.
 *
 * Everything a run does is idempotent per step and guarded by the run's
 * own `wake_at`, so calling this twice in a minute is harmless — which is
 * what makes the piggyback safe.
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { advanced } = await advanceRuns();
  return NextResponse.json({ advanced });
}

/**
 * Wrapped so a failure is recorded and emailed rather than disappearing
 * into a 500 that nobody looks at. It re-throws afterwards on purpose:
 * the platform's own retry and alerting depend on the route genuinely
 * failing, and swallowing it here would make a broken job look healthy.
 */
export async function GET(request: Request) {
  return reportingFailures("cron:whatsapp-flows", () => run(request));
}
