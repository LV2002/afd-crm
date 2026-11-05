import "server-only";

import { and, eq, gte, isNull, lt } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { attendanceAdjustments, attendancePunches, employees } from "@/lib/db/schema";
import { loadWeek } from "@/lib/hr/schedule";
import { loadHolidays } from "@/lib/hr/service";
import { approvedLeaveEntries } from "@/lib/payroll/service";

import { buildAttendance, type AttendanceReport } from "./report";

/** One employee's attendance for a month, from their punches. Null if they have no biometric code. */
export async function loadAttendanceReport(tx: DbExecutor, employeeId: string, month: string): Promise<AttendanceReport | null> {
  const [emp] = await tx.select().from(employees).where(eq(employees.id, employeeId));
  if (!emp || !emp.biometricCode) return null;

  const { week } = await loadWeek(tx, emp.id);
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

  const adj = await tx
    .select({ date: attendanceAdjustments.onDate, kind: attendanceAdjustments.kind })
    .from(attendanceAdjustments)
    .where(and(eq(attendanceAdjustments.employeeId, emp.id), isNull(attendanceAdjustments.removedAt)));

  return buildAttendance({
    month,
    week,
    adjustments: new Map(adj.map((a) => [a.date, a.kind])),
    holidays,
    dateOfJoining: emp.dateOfJoining,
    punches: rows.map((r) => r.at),
    leave,
    today: new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10),
  });
}

/** Comp-offs earned (worked on a day off) less comp-offs taken, over all time. */
export async function compOffBalance(tx: DbExecutor, employeeId: string): Promise<{ earned: number; taken: number }> {
  const rows = await tx
    .select({ kind: attendanceAdjustments.kind })
    .from(attendanceAdjustments)
    .where(and(eq(attendanceAdjustments.employeeId, employeeId), isNull(attendanceAdjustments.removedAt)));
  return { earned: rows.filter((r) => r.kind === "worked_off_day").length, taken: rows.filter((r) => r.kind === "comp_off").length };
}
