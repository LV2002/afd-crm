import { entitlement, inProbation, type LeavePolicy } from "@/lib/hr/leave";

/**
 * The payroll calculation, as a pure function: facts in, a payslip out.
 * Nothing here reads a database or a clock, so the same inputs always give
 * the same slip (regenerating a month must not change it), and every rule can
 * be tested with the worked examples from the payroll brief.
 *
 * Money is whole paise throughout. Each line is rounded to the paisa once,
 * and the net is the sum of the rounded lines, so a slip always adds up.
 */

export interface PayrollSettings {
  lateAllowanceMin: number;
  earlyAllowanceMin: number;
  /** A fixed divisor (e.g. 60), or null for the days in the month. */
  divisor: number | null;
  deductionFactor: number;
}

export type EntryType = "sick" | "casual" | "lop" | "half_day" | "late" | "early" | "miss_punch";

export interface PayrollEntry {
  date: string;
  type: EntryType;
  minutes?: number;
  notes?: string;
}

export interface Components {
  basic: number;
  hra: number;
  other: number;
  medical: number;
}

export interface PayrollMoney {
  overtime: number;
  arrears: number;
  incentives: number;
  insurance: number;
  bonus: number;
  advanceGiven: number;
  advanceRepaid: number;
}

export interface PayrollInput {
  /** yyyy-MM */
  month: string;
  settings: PayrollSettings;
  leave: LeavePolicy;
  employee: { dateOfJoining: string | null; designation: string | null };
  /** The monthly components in force at the start of the month (the OLD ones, if there is a revision). */
  base: Components;
  revision?: { effectiveDate: string; newDesignation?: string | null; newComponents: Partial<Components> };
  /** Brought forward from the previous month's closing. */
  opening: { sl: number; cl: number; advancePaise: number };
  money: PayrollMoney;
  entries: PayrollEntry[];
}

export interface TreatedLeave {
  date: string;
  type: "sick" | "casual" | "lop" | "half_day";
  /** What happened to it: paid out of a balance, or loss of pay, or half a day. */
  treatedAs: "paid_sick" | "paid_casual" | "lop" | "half_day";
  reason: string;
  slAfter: number;
  clAfter: number;
  lopDays: number;
}

export interface MinutesDeduction {
  dates: string[];
  totalMinutes: number;
  allowanceMinutes: number;
  excessMinutes: number;
  days: number;
  amount: number;
}

export interface PayrollResult {
  month: string;
  daysInMonth: number;
  paidDays: number;
  joinedThisMonth: boolean;
  /** Monthly components as paid this month: prorated for a joiner, blended across a revision. */
  components: Components;
  /** Full-month gross used for the daily rate. */
  fullGross: number;
  designation: string | null;
  breakupNote: string | null;
  earnings: number;
  deductions: number;
  net: number;
  lines: PayrollMoney & { late: number; early: number; lop: number };
  leave: {
    treated: TreatedLeave[];
    slClosing: number;
    clClosing: number;
    lopDays: number;
    lopAmount: number;
    miss: string[];
  };
  late: MinutesDeduction;
  early: MinutesDeduction;
  advance: { broughtForward: number; given: number; repaid: number; closing: number };
}

export type PayrollOutcome = { ok: true; result: PayrollResult } | { ok: false; errors: string[] };

const sum = (c: Components) => c.basic + c.hra + c.other + c.medical;

function daysIn(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const dayOf = (date: string) => Number(date.slice(8, 10));

const KEYS: Array<keyof Components> = ["basic", "hra", "other", "medical"];

/**
 * The balances to start a month from. The previous closing wins; across a
 * New Year they reset to the year's entitlement (no carry over). An employee
 * with no earlier slip starts from the balances brought forward from an old
 * payslip if those are from this year, otherwise from the entitlement.
 */
export function resolveOpening(input: {
  month: string;
  previous: { month: string; sl: number; cl: number; advancePaise: number } | null;
  employee: {
    dateOfJoining: string | null;
    openingSl: number | null;
    openingCl: number | null;
    openingAsOf: string | null;
    openingAdvancePaise: number;
  };
  leave: LeavePolicy;
}): { sl: number; cl: number; advancePaise: number } {
  const year = Number(input.month.slice(0, 4));
  const fresh = {
    sl: entitlement(input.leave.annualSick, input.employee.dateOfJoining, year, input.leave.joiningMonthCounts),
    cl: entitlement(input.leave.annualCasual, input.employee.dateOfJoining, year, input.leave.joiningMonthCounts),
  };
  if (input.previous) {
    const sameYear = Number(input.previous.month.slice(0, 4)) === year;
    return sameYear
      ? { sl: input.previous.sl, cl: input.previous.cl, advancePaise: input.previous.advancePaise }
      : { ...fresh, advancePaise: input.previous.advancePaise };
  }
  const e = input.employee;
  const useOpening =
    e.openingAsOf !== null && Number(e.openingAsOf.slice(0, 4)) === year && e.openingSl !== null && e.openingCl !== null;
  return {
    sl: useOpening ? (e.openingSl as number) : fresh.sl,
    cl: useOpening ? (e.openingCl as number) : fresh.cl,
    advancePaise: e.openingAdvancePaise,
  };
}

/**
 * Walks leave in date order against the balances. A day is paid if the
 * matching balance is at least one day and, during probation, the month's
 * paid-leave cap has not been used. Otherwise it is loss of pay, and the
 * reason is kept so the slip can say why.
 */
export function treatLeave(input: {
  entries: PayrollEntry[];
  sl: number;
  cl: number;
  dateOfJoining: string | null;
  leave: LeavePolicy;
}): { treated: TreatedLeave[]; slClosing: number; clClosing: number; lopDays: number } {
  let sl = input.sl;
  let cl = input.cl;
  let paidInProbation = 0;
  let lopDays = 0;
  const treated: TreatedLeave[] = [];

  const leaves = input.entries
    .filter((e): e is PayrollEntry & { type: "sick" | "casual" | "lop" | "half_day" } =>
      e.type === "sick" || e.type === "casual" || e.type === "lop" || e.type === "half_day",
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const e of leaves) {
    if (e.type === "half_day") {
      lopDays += 0.5;
      treated.push({ date: e.date, type: e.type, treatedAs: "half_day", reason: "Half day (0.5 day deducted)", slAfter: sl, clAfter: cl, lopDays: 0.5 });
      continue;
    }
    if (e.type === "lop") {
      lopDays += 1;
      treated.push({ date: e.date, type: e.type, treatedAs: "lop", reason: "Loss of pay", slAfter: sl, clAfter: cl, lopDays: 1 });
      continue;
    }

    const probation = inProbation(input.dateOfJoining, e.date, input.leave.probationMonths);
    const capped = probation && paidInProbation >= input.leave.probationPaidPerMonth;
    const balance = e.type === "sick" ? sl : cl;
    const name = e.type === "sick" ? "sick" : "casual";

    if (!capped && balance >= 1) {
      if (e.type === "sick") sl -= 1;
      else cl -= 1;
      if (probation) paidInProbation += 1;
      treated.push({
        date: e.date,
        type: e.type,
        treatedAs: e.type === "sick" ? "paid_sick" : "paid_casual",
        reason: e.type === "sick" ? "Paid sick leave" : "Paid casual leave",
        slAfter: sl,
        clAfter: cl,
        lopDays: 0,
      });
    } else {
      lopDays += 1;
      treated.push({
        date: e.date,
        type: e.type,
        treatedAs: "lop",
        reason: capped
          ? `Loss of pay (probation: ${input.leave.probationPaidPerMonth} paid leave per month)`
          : `Loss of pay (no ${name} leave balance)`,
        slAfter: sl,
        clAfter: cl,
        lopDays: 1,
      });
    }
  }
  return { treated, slClosing: sl, clClosing: cl, lopDays };
}

export function calculatePayslip(input: PayrollInput): PayrollOutcome {
  const errors: string[] = [];
  const { month, settings, money } = input;
  const dim = daysIn(month);
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(dim).padStart(2, "0")}`;
  const doj = input.employee.dateOfJoining;

  if (doj && doj > monthEnd) errors.push("This employee had not joined by the end of that month.");

  // Validation of what was typed.
  const seenDays = new Set<string>();
  for (const e of input.entries) {
    if (e.date < monthStart || e.date > monthEnd) errors.push(`${e.date} is outside ${month}.`);
    if ((e.type === "late" || e.type === "early") && !(e.minutes && e.minutes > 0)) {
      errors.push(`${e.date}: minutes are needed for a ${e.type === "late" ? "late coming" : "early exit"}.`);
    }
    if (e.type === "sick" || e.type === "casual" || e.type === "lop" || e.type === "half_day") {
      if (seenDays.has(e.date)) errors.push(`${e.date} has more than one full-day entry.`);
      seenDays.add(e.date);
    }
  }
  for (const [k, v] of Object.entries(money)) {
    if (!Number.isInteger(v) || v < 0) errors.push(`${k} must be zero or more.`);
  }
  if (money.advanceRepaid > input.opening.advancePaise + money.advanceGiven) {
    errors.push("The advance repaid is more than the advance outstanding.");
  }
  if (input.revision) {
    const r = input.revision;
    if (r.effectiveDate < monthStart || r.effectiveDate > monthEnd) errors.push("The revision date must be inside the month.");
    const changesPay = KEYS.some((k) => r.newComponents[k] !== undefined && r.newComponents[k] !== input.base[k]);
    const changesRole = r.newDesignation !== undefined && r.newDesignation !== null && r.newDesignation !== input.employee.designation;
    if (!changesPay && !changesRole) errors.push("The revision changes nothing.");
  }
  if (errors.length > 0) return { ok: false, errors };

  const joinedThisMonth = doj !== null && doj >= monthStart;
  const joinDay = joinedThisMonth ? dayOf(doj as string) : 1;
  const paidDays = dim - joinDay + 1;

  const oldFull = input.base;
  const newFull: Components = { ...oldFull };
  if (input.revision) for (const k of KEYS) newFull[k] = input.revision.newComponents[k] ?? oldFull[k];

  // Components as paid this month.
  const components = { ...oldFull };
  let breakupNote: string | null = null;
  let fullGross = sum(oldFull);
  const effective = input.revision?.effectiveDate ?? null;

  if (effective) {
    const eDay = dayOf(effective);
    const before = Math.max(0, eDay - joinDay);
    const from = paidDays - before;
    for (const k of KEYS) components[k] = Math.round((oldFull[k] * before + newFull[k] * from) / dim);
    // The daily rate of a revision month is the blended full-month figure.
    const beforeFull = eDay - 1;
    fullGross = KEYS.reduce((t, k) => t + Math.round((oldFull[k] * beforeFull + newFull[k] * (dim - beforeFull)) / dim), 0);
    breakupNote = `revised from ${eDay}${suffix(eDay)}`;
  } else if (joinedThisMonth) {
    for (const k of KEYS) components[k] = Math.round((oldFull[k] * paidDays) / dim);
  }
  if (joinedThisMonth) {
    breakupNote = `${breakupNote ? `${breakupNote}; ` : ""}joined ${joinDay}${suffix(joinDay)}: paid ${paidDays} of ${dim} days`;
  }

  const grossOn = (date: string) => (effective && date >= effective ? sum(newFull) : sum(oldFull));

  // Leave.
  const treatedResult = treatLeave({
    entries: input.entries,
    sl: input.opening.sl,
    cl: input.opening.cl,
    dateOfJoining: doj,
    leave: input.leave,
  });
  let lopFloat = 0;
  for (const t of treatedResult.treated) {
    if (t.lopDays > 0) lopFloat += (t.lopDays * grossOn(t.date)) / dim;
  }
  const lop = Math.round(lopFloat);

  // Late coming and early exit: tracked separately, each with its own free allowance.
  const divisor = settings.divisor ?? dim;
  const minutesDeduction = (type: "late" | "early", allowance: number): MinutesDeduction => {
    const rows = input.entries.filter((e) => e.type === type);
    const total = rows.reduce((t, e) => t + (e.minutes ?? 0), 0);
    const excess = Math.max(0, total - allowance);
    const days = (excess / divisor) * settings.deductionFactor;
    return {
      dates: rows.map((r) => r.date).sort(),
      totalMinutes: total,
      allowanceMinutes: allowance,
      excessMinutes: excess,
      days,
      amount: Math.round((days * fullGross) / dim),
    };
  };
  const late = minutesDeduction("late", settings.lateAllowanceMin);
  const early = minutesDeduction("early", settings.earlyAllowanceMin);

  const earnings = sum(components) + money.overtime + money.arrears + money.incentives + money.bonus;
  const deductions = money.insurance + money.advanceRepaid + late.amount + early.amount + lop;

  return {
    ok: true,
    result: {
      month,
      daysInMonth: dim,
      paidDays,
      joinedThisMonth,
      components,
      fullGross,
      designation: input.revision?.newDesignation ?? input.employee.designation,
      breakupNote,
      earnings,
      deductions,
      net: earnings - deductions,
      lines: { ...money, late: late.amount, early: early.amount, lop },
      leave: {
        treated: treatedResult.treated,
        slClosing: treatedResult.slClosing,
        clClosing: treatedResult.clClosing,
        lopDays: treatedResult.lopDays,
        lopAmount: lop,
        miss: input.entries.filter((e) => e.type === "miss_punch").map((e) => e.date).sort(),
      },
      late,
      early,
      advance: {
        broughtForward: input.opening.advancePaise,
        given: money.advanceGiven,
        repaid: money.advanceRepaid,
        closing: input.opening.advancePaise + money.advanceGiven - money.advanceRepaid,
      },
    },
  };
}

function suffix(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][day % 10 > 3 ? 0 : day % 10];
}

/**
 * How many approved sick/casual days in a year will be paid as loss of pay
 * because of the probation cap (and so would not be, without it). Runs the
 * same rule payroll runs, month by month, so what an employee is told matches
 * what their payslip will do.
 */
export function probationLopDays(input: {
  /** Approved sick and casual days, one date each. */
  days: Array<{ date: string; type: "sick" | "casual" }>;
  year: number;
  dateOfJoining: string | null;
  leave: LeavePolicy;
}): number {
  let sl = entitlement(input.leave.annualSick, input.dateOfJoining, input.year, input.leave.joiningMonthCounts);
  let cl = entitlement(input.leave.annualCasual, input.dateOfJoining, input.year, input.leave.joiningMonthCounts);
  let lop = 0;
  for (let m = 1; m <= 12; m++) {
    const prefix = `${input.year}-${String(m).padStart(2, "0")}`;
    const entries = input.days.filter((d) => d.date.startsWith(prefix)).map((d) => ({ date: d.date, type: d.type }));
    if (entries.length === 0) continue;
    const r = treatLeave({ entries, sl, cl, dateOfJoining: input.dateOfJoining, leave: input.leave });
    lop += r.treated.filter((t) => t.reason.includes("probation")).length;
    sl = r.slClosing;
    cl = r.clClosing;
  }
  return lop;
}
