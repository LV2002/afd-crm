/**
 * Leave rules, with no database in them so they can be tested on their own.
 *
 * The rules come from the payroll brief and every number is the policy's, not
 * a constant: how many days a year, whether the joining month counts, which
 * days are the weekly off. Nothing here knows a company name or a year.
 */

export interface LeavePolicy {
  annualSick: number;
  annualCasual: number;
  joiningMonthCounts: boolean;
  probationMonths: number;
  probationPaidPerMonth: number;
  /** 0 = Sunday. */
  weeklyOff: number[];
}

export type LeaveKindForMath = "sick" | "casual" | "lop" | "half_day";

export const LEAVE_KIND_LABELS: Record<LeaveKindForMath, string> = {
  sick: "Sick leave",
  casual: "Casual leave",
  lop: "Loss of pay",
  half_day: "Half day",
};

const DAY_MS = 86_400_000;

function utc(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Leave for one year. A full year is the policy's annual figure. In the
 * year somebody joins it is `annual × months left ÷ 12`, to the nearest half
 * day, where the joining month counts or not as the policy says. Joined in an
 * earlier year, or no joining date at all (long-standing): the full year. A
 * joining date in a later year: nothing yet.
 */
export function entitlement(
  annual: number,
  dateOfJoining: string | null,
  year: number,
  joiningMonthCounts: boolean,
): number {
  if (!dateOfJoining) return annual;
  const joinedYear = Number(dateOfJoining.slice(0, 4));
  if (joinedYear < year) return annual;
  if (joinedYear > year) return 0;
  const month = Number(dateOfJoining.slice(5, 7));
  const months = Math.max(0, (joiningMonthCounts ? 12 : 11) - (month - 1));
  return Math.round(((annual * months) / 12) * 2) / 2;
}

/** The working dates in a range: not a weekly off, not a company holiday. */
export function workingDates(
  from: string,
  to: string,
  holidays: ReadonlySet<string>,
  weeklyOff: readonly number[],
): string[] {
  const out: string[] = [];
  for (let t = utc(from); t <= utc(to); t += DAY_MS) {
    const date = iso(t);
    if (weeklyOff.includes(new Date(t).getUTCDay())) continue;
    if (holidays.has(date)) continue;
    out.push(date);
  }
  return out;
}

/** How many leave days a request uses. A half day is 0.5 and must itself be a working day. */
export function countLeaveDays(
  kind: LeaveKindForMath,
  from: string,
  to: string,
  holidays: ReadonlySet<string>,
  weeklyOff: readonly number[],
): number {
  const days = workingDates(from, to, holidays, weeklyOff).length;
  return kind === "half_day" ? (days > 0 ? 0.5 : 0) : days;
}

export function inProbation(dateOfJoining: string | null, onDate: string, probationMonths: number): boolean {
  if (!dateOfJoining) return false;
  const end = new Date(`${dateOfJoining}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + probationMonths);
  return utc(onDate) < end.getTime();
}

export interface LeaveRow {
  kind: LeaveKindForMath;
  fromDate: string;
  toDate: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
}

export interface EmployeeLeaveFacts {
  dateOfJoining: string | null;
  openingSl: number | null;
  openingCl: number | null;
  openingAsOf: string | null;
}

export interface Pool {
  entitled: number;
  used: number;
  pending: number;
  remaining: number;
  /** Used beyond the balance: paid as loss of pay. */
  overdrawn: number;
}

export interface LeaveBalance {
  year: number;
  sick: Pool;
  casual: Pool;
  /** Loss-of-pay and half days approved this year, in days. */
  lopDays: number;
}

/**
 * Balances for a calendar year. They reset on 1 January, with no carry over.
 * An employee whose history is on an old payslip starts from the balances on
 * that payslip, and only leave after that date is counted against them.
 */
export function leaveBalance(input: {
  employee: EmployeeLeaveFacts;
  year: number;
  policy: LeavePolicy;
  requests: LeaveRow[];
  holidays: ReadonlySet<string>;
}): LeaveBalance {
  const { employee, year, policy, requests, holidays } = input;
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const openingYear = employee.openingAsOf ? Number(employee.openingAsOf.slice(0, 4)) : null;
  const useOpening = openingYear === year;

  const tally = (kind: "sick" | "casual", status: "approved" | "pending"): number => {
    let days = 0;
    for (const r of requests) {
      if (r.kind !== kind || r.status !== status) continue;
      for (const date of workingDates(r.fromDate, r.toDate, holidays, policy.weeklyOff)) {
        if (date < from || date > to) continue;
        if (useOpening && employee.openingAsOf && date <= employee.openingAsOf) continue;
        days += 1;
      }
    }
    return days;
  };

  const pool = (kind: "sick" | "casual"): Pool => {
    const annual = kind === "sick" ? policy.annualSick : policy.annualCasual;
    const opening = kind === "sick" ? employee.openingSl : employee.openingCl;
    const entitled = useOpening && opening !== null ? opening : entitlement(annual, employee.dateOfJoining, year, policy.joiningMonthCounts);
    const used = tally(kind, "approved");
    const pending = tally(kind, "pending");
    return {
      entitled,
      used,
      pending,
      remaining: Math.max(0, entitled - used),
      overdrawn: Math.max(0, used - entitled),
    };
  };

  let lopDays = 0;
  for (const r of requests) {
    if (r.status !== "approved" || (r.kind !== "lop" && r.kind !== "half_day")) continue;
    const dates = workingDates(r.fromDate, r.toDate, holidays, policy.weeklyOff).filter((d) => d >= from && d <= to);
    lopDays += r.kind === "half_day" ? dates.length * 0.5 : dates.length;
  }

  return { year, sick: pool("sick"), casual: pool("casual"), lopDays };
}

/** Whether two inclusive date ranges share a day. */
export function rangesOverlap(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  return aFrom <= bTo && bFrom <= aTo;
}

/** "14th", "3rd, 9th": how dates read on a slip. */
export function ordinal(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  return `${day}${["th", "st", "nd", "rd"][day % 10 > 3 ? 0 : day % 10]}`;
}
