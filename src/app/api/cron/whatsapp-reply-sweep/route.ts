import { NextResponse } from "next/server";

import { requireCronSecret } from "@/lib/cron/require-secret";
import { reportingFailures } from "@/lib/errors/capture";
import { sweepReplyAlerts } from "@/lib/whatsapp/reply-sweep";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Tells a counsellor when a student's WhatsApp message has waited too long.
 * Idempotent: each alert level is claimed in `whatsapp_reply_alerts` before
 * it is sent, so overlapping runs notify nobody twice.
 */
async function run(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;
  return NextResponse.json(await sweepReplyAlerts());
}

export async function GET(request: Request) {
  return reportingFailures("cron:whatsapp-reply-sweep", () => run(request));
}
