import { NextResponse } from "next/server";

import { requireCronSecret } from "@/lib/cron/require-secret";
import { reportingFailures } from "@/lib/errors/capture";
import { checkFinanceThresholds } from "@/lib/finance/thresholds";

export const dynamic = "force-dynamic";

/**
 * Tells accounts and the admins when the bank balance or the year's income
 * is about to reach a mark (₹20 lakh, ₹1 crore). Two sums and a handful of
 * rows, idempotent — each stage is announced once — so it runs hourly
 * (and in the daily safety net).
 */
async function run(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;
  return NextResponse.json(await checkFinanceThresholds());
}

export async function GET(request: Request) {
  return reportingFailures("cron:finance-thresholds", () => run(request));
}
