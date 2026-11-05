import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { formatINR } from "@/lib/format/currency";
import { reviewMonth } from "@/lib/payroll/review";

import { GenerateReviewedForm } from "../payroll-forms";

export const dynamic = "force-dynamic";

/** Before anything is generated: the month, person by person, with what looks odd. Nothing here is saved. */
export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "payroll.generate")) return <AccessDenied />;
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : new Date().toISOString().slice(0, 7);
  const rows = await reviewMonth(db, month);
  const ready = rows.filter((r) => r.state === "ready");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Review {month} before generating</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            What each payslip would be from the leave already approved and the biometric punches. Nothing is saved until you generate. Open
            anyone to add overtime, an advance, a correction, or to mark a day as a comp-off or excused (under Attendance) first.
          </p>
        </div>
        <form className="flex items-end gap-2">
          <input name="month" type="month" defaultValue={month} className="h-9 rounded-md border bg-background px-3 text-sm" />
          <button type="submit" className="h-9 rounded-md border px-3 text-sm">Show</button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2">Employee</th>
              <th className="p-2 text-right">Net pay (preview)</th>
              <th className="p-2">Loss of pay</th>
              <th className="p-2">Late / early (min)</th>
              <th className="p-2">To look at</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employeeId} className="border-t align-top">
                <td className="p-2 font-medium">{r.name}</td>
                {r.state === "ready" && r.result ? (
                  <>
                    <td className="p-2 text-right">{formatINR(r.result.net)}</td>
                    <td className="p-2">{r.result.leave.lopDays > 0 ? `${r.result.leave.lopDays} days · ${formatINR(r.result.lines.lop)}` : "—"}</td>
                    <td className="p-2">
                      {r.result.late.totalMinutes}/{r.result.early.totalMinutes}
                      {r.result.lines.late + r.result.lines.early > 0 ? ` · ${formatINR(r.result.lines.late + r.result.lines.early)}` : ""}
                    </td>
                  </>
                ) : (
                  <td colSpan={3} className="p-2">
                    {r.state === "generated" ? (
                      <span className="text-muted-foreground">Already generated. <Link className="underline" href={`/hr/payroll/${r.slipId}`}>Open it</Link></span>
                    ) : (
                      <Badge variant="destructive">{r.blocker}</Badge>
                    )}
                  </td>
                )}
                <td className="p-2 text-xs text-muted-foreground">{r.flags.length ? r.flags.join(" · ") : "—"}</td>
                <td className="p-2">
                  {r.state === "ready" && (
                    <Link href={`/hr/payroll/generate?month=${month}&employee=${r.employeeId}`} className="text-sm font-medium underline">
                      Open and edit
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <GenerateReviewedForm month={month} ready={ready.length} skippable={ready.map((r) => ({ id: r.employeeId, name: r.name }))} />
    </div>
  );
}
