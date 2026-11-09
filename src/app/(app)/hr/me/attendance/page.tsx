import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { loadAttendanceReport } from "@/lib/attendance/load";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { formatDateIST } from "@/lib/format/date";
import { employeeForUser } from "@/lib/hr/service";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  present: "Present", single: "One punch", absent: "No punch", leave: "On leave", comp_off: "Comp day off", off: "Day off", holiday: "Holiday", before_joining: "—", upcoming: "",
};

/** An employee's own biometric punch in and out times, day by day. */
export default async function MyAttendancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "hr.self")) return <AccessDenied />;
  const employee = await employeeForUser(db, user.id);
  if (!employee) {
    return <p className="max-w-xl rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Your login isn&apos;t linked to an employee record yet. Ask HR.</p>;
  }

  const sp = await searchParams;
  const nowMonth = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 7);
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : nowMonth;
  const report = await loadAttendanceReport(db, employee.id, month);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/hr/me" className="text-sm text-muted-foreground underline">← My HR</Link>
          <h2 className="text-lg font-semibold">My attendance</h2>
          <p className="text-sm text-muted-foreground">Your first and last biometric punch each day, as the device recorded them.</p>
        </div>
        <form className="flex items-end gap-2">
          <input name="month" type="month" defaultValue={month} max={nowMonth} className="h-9 rounded-md border bg-background px-3 text-sm" />
          <button type="submit" className="h-9 rounded-md border px-3 text-sm">Show</button>
        </form>
      </div>

      {!report ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No biometric code is set against your name yet, so there are no punches to show. Ask HR to add it.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {report.presentDays} day{report.presentDays === 1 ? "" : "s"} present
            {report.lateMinutes > 0 ? ` · ${report.lateMinutes} min late in total` : ""}
            {report.earlyMinutes > 0 ? ` · ${report.earlyMinutes} min early out in total` : ""}. This is a record of punches; your payslip is what counts.
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">Date</th>
                  <th className="p-2">Day</th>
                  <th className="p-2">In</th>
                  <th className="p-2">Out</th>
                  <th className="p-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {report.days
                  .filter((d) => d.status !== "before_joining")
                  .map((d) => (
                    <tr key={d.date} className="border-t">
                      <td className="whitespace-nowrap p-2">{formatDateIST(`${d.date}T12:00:00+05:30`, "EEE d MMM")}</td>
                      <td className="p-2">
                        {STATUS[d.status] && (
                          <Badge variant={d.status === "absent" ? "destructive" : d.status === "present" ? "default" : "secondary"}>{STATUS[d.status]}</Badge>
                        )}
                      </td>
                      <td className="p-2 font-mono">{d.first ?? ""}</td>
                      <td className="p-2 font-mono">{d.last ?? ""}</td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {d.lateMinutes > 0 ? `${d.lateMinutes} min late ` : ""}
                        {d.earlyMinutes > 0 ? `${d.earlyMinutes} min early ` : ""}
                        {d.compWork ? `comp work (${d.compWork === "half" ? "half" : "full"} day) ` : ""}
                        {d.compOff === "half" ? "half-day comp off " : ""}
                        {d.leaveKind ? d.leaveKind : ""}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
