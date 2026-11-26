import { NextResponse } from "next/server";

import { requireCronSecret } from "@/lib/cron/require-secret";
import { reportingFailures } from "@/lib/errors/capture";
import { sendCrmEventsToMeta } from "@/lib/integrations/meta/send-crm-events";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Reports lead status changes (Contacted, Hot, Took Admission…) to Meta's CRM funnel. */
async function run(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;
  return NextResponse.json(await sendCrmEventsToMeta());
}

export async function GET(request: Request) {
  return reportingFailures("cron:meta-events", () => run(request));
}
