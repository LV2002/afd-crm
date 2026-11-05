import type { PayrollEntry } from "@/lib/payroll/calc";

/**
 * The preliminary attendance report, from punches. Pure: punches and rules in,
 * a day-by-day picture and a set of suggested payroll entries out.
 *
 * It only ever suggests. A missing punch is as likely to be a flat battery as
 * an absence, so a person reads this and confirms it before it touches pay.
 */

export type DayStatus = "off" | "holiday" | "leave" | "present" | "single" | "absent" | "before_joining" | "upcoming";

export interface DayRow {
  date: string;
  status: DayStatus;
  first: string | null;
  last: string | null;
  lateMinutes: number;
  earlyMinutes: number;
  punches: number;
  leaveKind?: string;
}

export interface AttendanceReport {
  days: DayRow[];
  presentDays: number;
  absentDays: number;
  singlePunchDays: number;
  lateMinutes: number;
  earlyMinutes: number;
  suggestions: PayrollEntry[];
}

const IST_MS = 5.5 * 3_600_000;

/** Date (yyyy-mm-dd) and minutes since midnight, in India time. */
function istParts(at: Date): { date: string; minutes: number } {
  const t = new Date(at.getTime() + IST_MS);
  return { date: t.toISOString().slice(0, 10), minutes: t.getUTCHours() * 60 + t.getUTCMinutes() };
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export function buildAttendance(input: {
  month: string;
  shiftStart: string;
  shiftEnd: string;
  weeklyOff: readonly number[];
  holidays: ReadonlySet<string>;
  dateOfJoining: string | null;
  punches: Date[];
  /** Approved leave, by date. */
  leave: ReadonlyMap<string, string>;
  /** Days after this are not judged yet. */
  today: string;
}): AttendanceReport {
  const dim = new Date(Date.UTC(Number(input.month.slice(0, 4)), Number(input.month.slice(5, 7)), 0)).getUTCDate();
  const start = toMinutes(input.shiftStart);
  const end = toMinutes(input.shiftEnd);

  const byDay = new Map<string, number[]>();
  for (const p of input.punches) {
    const { date, minutes } = istParts(p);
    if (!date.startsWith(input.month)) continue;
    byDay.set(date, [...(byDay.get(date) ?? []), minutes]);
  }

  const days: DayRow[] = [];
  for (let d = 1; d <= dim; d++) {
    const date = `${input.month}-${String(d).padStart(2, "0")}`;
    const mins = (byDay.get(date) ?? []).sort((a, b) => a - b);
    const base: DayRow = { date, status: "present", first: null, last: null, lateMinutes: 0, earlyMinutes: 0, punches: mins.length };
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();

    if (input.dateOfJoining && date < input.dateOfJoining) days.push({ ...base, status: "before_joining" });
    else if (date > input.today) days.push({ ...base, status: "upcoming" });
    else if (input.weeklyOff.includes(dow)) days.push({ ...base, status: "off", first: mins.length ? hhmm(mins[0]) : null });
    else if (input.holidays.has(date)) days.push({ ...base, status: "holiday" });
    else if (input.leave.has(date)) days.push({ ...base, status: "leave", leaveKind: input.leave.get(date), first: mins.length ? hhmm(mins[0]) : null });
    else if (mins.length === 0) days.push({ ...base, status: "absent" });
    else if (mins.length === 1) days.push({ ...base, status: "single", first: hhmm(mins[0]) });
    else {
      const first = mins[0];
      const last = mins[mins.length - 1];
      days.push({
        ...base,
        status: "present",
        first: hhmm(first),
        last: hhmm(last),
        lateMinutes: Math.max(0, first - start),
        earlyMinutes: Math.max(0, end - last),
      });
    }
  }

  const suggestions: PayrollEntry[] = [];
  for (const day of days) {
    if (day.status === "absent") suggestions.push({ date: day.date, type: "lop", notes: "No biometric punch" });
    if (day.status === "single") suggestions.push({ date: day.date, type: "miss_punch", notes: `Only one punch (${day.first})` });
    if (day.lateMinutes > 0) suggestions.push({ date: day.date, type: "late", minutes: day.lateMinutes, notes: `In ${day.first}` });
    if (day.earlyMinutes > 0) suggestions.push({ date: day.date, type: "early", minutes: day.earlyMinutes, notes: `Out ${day.last}` });
  }

  return {
    days,
    presentDays: days.filter((d) => d.status === "present" || d.status === "single").length,
    absentDays: days.filter((d) => d.status === "absent").length,
    singlePunchDays: days.filter((d) => d.status === "single").length,
    lateMinutes: days.reduce((t, d) => t + d.lateMinutes, 0),
    earlyMinutes: days.reduce((t, d) => t + d.earlyMinutes, 0),
    suggestions,
  };
}
