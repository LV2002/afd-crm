import { NextResponse } from "next/server";

import { requireCronSecret } from "@/lib/cron/require-secret";
import { reportingFailures } from "@/lib/errors/capture";
import { notify } from "@/lib/notifications/notify";

export const dynamic = "force-dynamic";

/**
 * On the first of the month, tells HR and accounts that last month's payroll
 * is ready to review. It does not generate anything: attendance and leave are
 * reviewed by a person first, which is the point of the review page.
 */
async function run(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const ist = new Date(Date.now() + 5.5 * 3_600_000);
  if (ist.getUTCDate() !== 1) return NextResponse.json({ skipped: "not the first of the month" });

  const prev = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - 1, 1));
  const month = prev.toISOString().slice(0, 7);
  const label = prev.toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

  const told = await notify({
    eventKey: "payroll.ready",
    context: { month: label },
    href: `/hr/payroll/review?month=${month}`,
    entityType: "payroll",
    entityId: month,
  });
  return NextResponse.json({ month, told });
}

export async function GET(request: Request) {
  return reportingFailures("cron:payroll-ready", () => run(request));
}
