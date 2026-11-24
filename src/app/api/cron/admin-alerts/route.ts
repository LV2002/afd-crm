import { NextResponse } from "next/server";

import { runAdminAlerts } from "@/lib/alerts/admin-alerts";
import { requireCronSecret } from "@/lib/cron/require-secret";
import { reportingFailures } from "@/lib/errors/capture";

export const dynamic = "force-dynamic";

/**
 * Tells the admin about fee instalments a month past due and leads nobody has
 * touched in a week. Once per instalment and per lead, so it is safe to run
 * as often as the scheduler likes; daily, at a civilised hour, is enough.
 */
async function run(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;
  return NextResponse.json(await runAdminAlerts());
}

export async function GET(request: Request) {
  return reportingFailures("cron:admin-alerts", () => run(request));
}
