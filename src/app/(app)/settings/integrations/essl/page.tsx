import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { biometricDevices, employees, payrollSettings } from "@/lib/db/schema";
import { formatDateIST } from "@/lib/format/date";
import { and, isNull } from "drizzle-orm";

import { DeviceForm, ImportForm, KeyForm, MapCodeForm, ShiftForm } from "../../../hr/attendance/attendance-forms";

export const dynamic = "force-dynamic";

/** eSSL biometric attendance setup. The report itself stays under HR → Attendance. */
export default async function EsslIntegrationPage() {
  const user = await getCurrentUser();
  if (!user || !(can(user, "settings.manage") || can(user, "hr.manage") || can(user, "payroll.manage"))) {
    return <AccessDenied />;
  }
  const canManage = can(user, "hr.manage") || can(user, "settings.manage");
  const canPayroll = can(user, "payroll.manage") || can(user, "settings.manage");

  const [[settings], devices, people, unmapped] = await Promise.all([
    db.select().from(payrollSettings).where(eq(payrollSettings.id, 1)),
    db.select().from(biometricDevices).orderBy(asc(biometricDevices.createdAt)),
    db.select({ id: employees.id, name: employees.name }).from(employees)
      .where(and(isNull(employees.deletedAt), eq(employees.status, "active"))).orderBy(asc(employees.name)),
    db.execute<{ code: string; n: string; last: string }>(sql`
      select device_code as code, count(*) as n, max(punched_at)::text as last
      from attendance_punches where employee_id is null group by device_code order by max(punched_at) desc limit 30`),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/settings/integrations" className="text-sm text-muted-foreground underline">← Integrations</Link>
        <h1 className="text-2xl font-semibold">eSSL biometric attendance</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Gets punches from your biometric devices into the CRM. The preliminary report built from them is under{" "}
          <Link href="/hr/attendance" className="underline">HR → Attendance</Link>.
        </p>
      </div>

      {canManage && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Get punches in</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Three ways, use whichever suits your setup. 1) Devices that support a cloud (ADMS) server push to this site on their own.
            2) A small relay next to the eSSL software posts the log here. 3) Export the log from the software and import it below.
          </p>
          <ImportForm />
          {[...unmapped].length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <p className="text-sm font-medium">Codes on the device that belong to nobody yet</p>
              {[...unmapped].map((u) => (
                <div key={u.code} className="flex flex-col gap-1">
                  <MapCodeForm code={u.code} employees={people} />
                  <p className="text-xs text-muted-foreground">{u.n} punches, latest {u.last.slice(0, 16)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {canPayroll && (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold">Setup</h2>
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
