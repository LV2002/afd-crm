import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { can, getCurrentUser } from "@/lib/auth/session";
import { loadAttendanceReport } from "@/lib/attendance/load";
import { db } from "@/lib/db/client";
import { employees, payrollSettings } from "@/lib/db/schema";
import { formatDateIST } from "@/lib/format/date";

import { AdjustForm } from "./attendance-forms";
import { compOffBalance } from "@/lib/attendance/load";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  present: "Present", single: "One punch", absent: "No punch", leave: "On leave", comp_off: "Comp-off", off: "Day off", holiday: "Holiday", before_joining: "—", upcoming: "",
};

/** The preliminary report: what the biometric punches say, for the payslip to be checked against. Suggestions only. */
export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ month?: string; employee?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "hr.read")) return <AccessDenied />;
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : new Date().toISOString().slice(0, 7);
  const canManage = can(user, "hr.manage");
  const canPayroll = can(user, "payroll.manage");

  const people = await db.select().from(employees).where(and(isNull(employees.deletedAt), eq(employees.status, "active"))).orderBy(asc(employees.name));
  const [settings] = await db.select().from(payrollSettings).where(eq(payrollSettings.id, 1));

  const reports = new Map<string, Awaited<ReturnType<typeof loadAttendanceReport>>>();
  const loaded = await Promise.all(people.map((p) => loadAttendanceReport(db, p.id, month)));
  people.forEach((p, i) => reports.set(p.id, loaded[i]));
  const detail = sp.employee ? people.find((p) => p.id === sp.employee) : undefined;
  const detailReport = detail ? reports.get(detail.id) : null;
  const comp = detail ? await compOffBalance(db, detail.id) : null;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Attendance</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              From the biometric punches, against a shift of {settings?.shiftStart.slice(0, 5)} to {settings?.shiftEnd.slice(0, 5)}. A missing
              punch is as likely to be a flat battery as an absence, so this only suggests: a person confirms it when generating the payslip.
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
                <th className="p-2">Days present</th>
                <th className="p-2">No punch</th>
                <th className="p-2">One punch</th>
                <th className="p-2">Late (min)</th>
                <th className="p-2">Early (min)</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const r = reports.get(p.id);
                return (
                  <tr key={p.id} className="border-t">
                    <td className="p-2 font-medium">
                      {r ? <Link href={`/hr/attendance?month=${month}&employee=${p.id}`} className="underline">{p.name}</Link> : p.name}
                    </td>
                    {r ? (
                      <>
                        <td className="p-2">{r.presentDays}</td>
                        <td className="p-2">{r.absentDays}</td>
                        <td className="p-2">{r.singlePunchDays}</td>
                        <td className="p-2">{r.lateMinutes}</td>
                        <td className="p-2">{r.earlyMinutes}</td>
                      </>
                    ) : (
                      <td colSpan={5} className="p-2 text-muted-foreground">No biometric code set. Add it on their employee page, or map it in Settings → Integrations → eSSL.</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {detail && detailReport && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{detail.name}: day by day</h3>
          {comp && (
            <p className="text-xs text-muted-foreground">
              Comp-offs: {comp.earned} earned by working on a day off, {comp.taken} taken, {comp.earned - comp.taken} left.
            </p>
          )}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <tbody>
                {detailReport.days.map((d) => (
                  <tr key={d.date} className="border-t">
                    <td className="p-1.5 whitespace-nowrap">{formatDateIST(`${d.date}T12:00:00+05:30`, "EEE d MMM")}</td>
                    <td className="p-1.5">
                      <Badge variant={d.status === "absent" ? "destructive" : d.status === "present" ? "default" : "secondary"}>{STATUS_LABEL[d.status]}</Badge>
                      {d.leaveKind && <span className="ml-1 text-xs text-muted-foreground">{d.leaveKind}</span>}
                    </td>
                    <td className="p-1.5">{d.first ? `${d.first}${d.last ? ` – ${d.last}` : ""}` : ""}</td>
                    <td className="p-1.5 text-xs text-muted-foreground">
                      {d.lateMinutes > 0 ? `${d.lateMinutes} min late ` : ""}
                      {d.earlyMinutes > 0 ? `${d.earlyMinutes} min early` : ""}
                      {d.adjustment ? ` · marked: ${d.adjustment.replace("_", " ")}` : ""}
                    </td>
                    {canManage && d.status !== "upcoming" && d.status !== "before_joining" && (
                      <td className="p-1.5">
                        <AdjustForm employeeId={detail.id} date={d.date} current={d.adjustment} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(canManage || canPayroll) && (
        <p className="text-sm text-muted-foreground">
          Devices, relay key, shift times, punch import and unmapped codes now live in{" "}
          <Link href="/settings/integrations/essl" className="underline">Settings → Integrations → eSSL</Link>.
        </p>
      )}
    </div>
  );
}
