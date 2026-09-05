import { NextResponse } from "next/server";

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
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { advanced } = await advanceRuns();
  return NextResponse.json({ advanced });
}
