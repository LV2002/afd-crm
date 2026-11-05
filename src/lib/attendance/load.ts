import "server-only";

import { and, eq, gte, lt } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { attendancePunches, employees, payrollSettings } from "@/lib/db/schema";
import { loadHolidays, loadPolicy } from "@/lib/hr/service";
import { approvedLeaveEntries } from "@/lib/payroll/service";

import { buildAttendance, type AttendanceReport } from "./report";

const hhmm = (t: string) => t.slice(0, 5);

/** One employee's attendance for a month, from their punches. Null if they have no biometric code. */
export async function loadAttendanceReport(tx: DbExecutor, employeeId: string, month: string): Promise<AttendanceReport | null> {
  const [emp] = await tx.select().from(employees).where(eq(employees.id, employeeId));
  if (!emp || !emp.biometricCode) return null;

  const [settings] = await tx.select().from(payrollSettings).where(eq(payrollSettings.id, 1));
  const policy = await loadPolicy(tx);
  const holidays = new Set((await loadHolidays(tx, emp.centerId)).map((h) => h.onDate));
  const leave = new Map((await approvedLeaveEntries(tx, emp.id, month)).map((e) => [e.date, e.type]));

  // A day's punches can fall either side of midnight UTC, so the window is padded.
  const from = new Date(`${month}-01T00:00:00+05:30`);
  const to = new Date(from);
  to.setUTCMonth(to.getUTCMonth() + 1);
  const rows = await tx
    .select({ at: attendancePunches.punchedAt })
    .from(attendancePunches)
    .where(and(eq(attendancePunches.employeeId, emp.id), gte(attendancePunches.punchedAt, from), lt(attendancePunches.punchedAt, to)));

  return buildAttendance({
    month,
    shiftStart: hhmm(settings?.shiftStart ?? "09:30"),
    shiftEnd: hhmm(settings?.shiftEnd ?? "17:30"),
    weeklyOff: policy.weeklyOff,
    holidays,
    dateOfJoining: emp.dateOfJoining,
    punches: rows.map((r) => r.at),
    leave,
    today: new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10),
  });
}
