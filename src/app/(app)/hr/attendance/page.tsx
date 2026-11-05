import Link from "next/link";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { can, getCurrentUser } from "@/lib/auth/session";
import { loadAttendanceReport } from "@/lib/attendance/load";
import { db } from "@/lib/db/client";
import { biometricDevices, employees, payrollSettings } from "@/lib/db/schema";
import { formatDateIST } from "@/lib/format/date";

import { AdjustForm, DeviceForm, ImportForm, KeyForm, MapCodeForm, ShiftForm } from "./attendance-forms";
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
  const devices = await db.select().from(biometricDevices).orderBy(asc(biometricDevices.createdAt));
  const unmapped = canManage
    ? [...(await db.execute<{ code: string; n: string; last: string }>(sql`
        select device_code as code, count(*) as n, max(punched_at)::text as last
        from attendance_punches where employee_id is null group by device_code order by max(punched_at) desc limit 30`))]
    : [];

  const reports = new Map<string, Awaited<ReturnType<typeof loadAttendanceReport>>>();
  for (const p of people) reports.set(p.id, await loadAttendanceReport(db, p.id, month));
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
                      <td colSpan={5} className="p-2 text-muted-foreground">No biometric code set. Add it on their employee page, or map it below.</td>
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

      {canManage && (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Get punches in</h3>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Three ways, use whichever suits your setup. 1) Devices that support a cloud (ADMS) server push to this site on their own.
            2) A small relay next to the eSSL software posts the log here. 3) Export the log from the software and import it below.
          </p>
          <ImportForm />
          {unmapped.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <p className="text-sm font-medium">Codes on the device that belong to nobody yet</p>
              {unmapped.map((u) => (
                <div key={u.code} className="flex flex-col gap-1">
                  <MapCodeForm code={u.code} employees={people.map((p) => ({ id: p.id, name: p.name }))} />
                  <p className="text-xs text-muted-foreground">{u.n} punches, latest {u.last.slice(0, 16)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {canPayroll && (
        <section className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold">Setup</h3>
          <ShiftForm start={settings?.shiftStart.slice(0, 5) ?? "09:30"} end={settings?.shiftEnd.slice(0, 5) ?? "17:30"} />

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Devices that push to this site</p>
            <p className="text-xs text-muted-foreground">
              Register each device&apos;s serial number (in its menu under System / Device info). On the device, set the cloud server to this
              site&apos;s address. Registered devices:{" "}
              {devices.length === 0 ? "none" : devices.map((d) => `${d.name ?? d.serial}${d.lastSeenAt ? ` (last seen ${formatDateIST(d.lastSeenAt, "d MMM, h:mm a")})` : " (never seen)"}`).join("; ")}
            </p>
            <DeviceForm />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Relay key</p>
            <p className="text-xs text-muted-foreground">
              A script next to the eSSL software sends <code>POST /api/webhooks/essl</code> with the header{" "}
              <code>Authorization: Bearer &lt;key&gt;</code> and a JSON body <code>{`{ "punches": [ { "code": "10085", "time": "2026-11-03 09:41:05" } ] }`}</code>.{" "}
              {settings?.attendanceKeySetAt ? `A key was made ${formatDateIST(settings.attendanceKeySetAt, "d MMM yyyy")}.` : "No key has been made yet."}
            </p>
            <KeyForm hasKey={Boolean(settings?.attendanceKeySetAt)} />
          </div>
        </section>
      )}
    </div>
  );
}
