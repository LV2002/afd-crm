import { eq } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { employeeSchedules, payrollSettings } from "@/lib/db/schema";

import { loadPolicy } from "./service";

/**
 * Each person's working week: which days they work, and from when to when.
 * An employee with no schedule of their own works the company default (the
 * policy's weekly off and the company shift), so nothing changes for anyone
 * until HR sets one.
 */

export interface DaySchedule {
  working: boolean;
  /** HH:MM */
  start: string;
  end: string;
}

/** Index 0 = Sunday. */
export type WeekSchedule = DaySchedule[];

export function defaultWeek(weeklyOff: readonly number[], start: string, end: string): WeekSchedule {
  return Array.from({ length: 7 }, (_, d) => ({ working: !weeklyOff.includes(d), start, end }));
}

export const weeklyOffOf = (week: WeekSchedule): number[] => week.flatMap((d, i) => (d.working ? [] : [i]));

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

/** The employee's own week if they have one, otherwise the company's. */
export async function loadWeek(tx: DbExecutor, employeeId: string): Promise<{ week: WeekSchedule; custom: boolean }> {
  const [settings] = await tx.select().from(payrollSettings).where(eq(payrollSettings.id, 1));
  const policy = await loadPolicy(tx);
  const fallback = defaultWeek(policy.weeklyOff, hhmm(settings?.shiftStart ?? "09:30"), hhmm(settings?.shiftEnd ?? "17:30"));

  const rows = await tx.select().from(employeeSchedules).where(eq(employeeSchedules.employeeId, employeeId));
  if (rows.length === 0) return { week: fallback, custom: false };
  const week = fallback.map((d) => ({ ...d }));
  for (const r of rows) {
    week[r.weekday] = r.isWorking
      ? { working: true, start: hhmm(r.startTime) || fallback[r.weekday].start, end: hhmm(r.endTime) || fallback[r.weekday].end }
      : { working: false, start: fallback[r.weekday].start, end: fallback[r.weekday].end };
  }
  return { week, custom: true };
}

export function validateWeek(week: WeekSchedule): string | null {
  if (week.length !== 7) return "A week has seven days.";
  if (!week.some((d) => d.working)) return "At least one day has to be a working day.";
  for (const [i, d] of week.entries()) {
    if (!d.working) continue;
    if (!/^\d{2}:\d{2}$/.test(d.start) || !/^\d{2}:\d{2}$/.test(d.end)) return "Give a start and end time for every working day.";
    if (d.end <= d.start) return `On ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i]} the end has to be after the start.`;
  }
  return null;
}

/** Replaces the employee's week. Passing null goes back to the company default. */
export async function saveWeek(tx: DbExecutor, employeeId: string, week: WeekSchedule | null): Promise<void> {
  await tx.delete(employeeSchedules).where(eq(employeeSchedules.employeeId, employeeId));
  if (!week) return;
  await tx.insert(employeeSchedules).values(
    week.map((d, weekday) => ({
      employeeId,
      weekday,
      isWorking: d.working,
      startTime: d.working ? d.start : null,
      endTime: d.working ? d.end : null,
    })),
  );
}
