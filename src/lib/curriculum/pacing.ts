/**
 * "Will this course actually finish by mid-November?"
 *
 * The question the coordinator cannot answer today, and the reason a week
 * of timetabling takes three days: the plan lives in her head, the
 * calendar lives in a sheet, and nothing multiplies one by the other. So
 * she finds out in the first week of November that Foundation is eleven
 * hours behind, when the only remedies left are bad ones.
 *
 * This is deliberately arithmetic, not a scheduler. It answers three
 * questions and stops:
 *
 *   - how many hours the plan asks for,
 *   - how many teaching hours the calendar actually contains before the
 *     deadline,
 *   - and therefore whether the plan fits, and by how much it misses.
 *
 * Everything here is pure: no database, no clock, no timezone conversion.
 * Dates arrive as `YYYY-MM-DD` strings — the same shape the `date` columns
 * hand back — and are compared as strings, which is correct for ISO dates
 * and avoids constructing a Date only to ask which day of the week it is
 * in Asia/Kolkata. The one place a real weekday is needed goes through
 * `dayOfWeekIST()`, which is explicit about it.
 */

/** A recurring weekly slot: "Saturdays, 10:00–13:00". */
export interface SessionSlot {
  /** 0 = Sunday, matching Postgres `extract(dow)` and JS `getDay()`. */
  dayOfWeek: number;
  /** `HH:MM` or `HH:MM:SS` — Postgres `time` renders the latter. */
  startTime: string;
  endTime: string;
}

/** One block of the plan. Only the hours matter here; the kind is carried for the breakdown. */
export interface PlannedBlock {
  kind: "teaching" | "practice" | "mock_test" | "revision";
  hours: number;
}

export interface PacingInput {
  slots: SessionSlot[];
  blocks: PlannedBlock[];
  /** Inclusive. Usually today, or the batch's start date if it has not begun. */
  fromDate: string;
  /** Inclusive — the last day teaching may happen. AFD's is in mid-November. */
  teachingEndDate: string;
  /** `YYYY-MM-DD` dates with no class: public holidays, centre closures. */
  holidays?: readonly string[];
  /** Hours already delivered, so a mid-course check measures what is left. */
  hoursAlreadyTaught?: number;
}

export interface PacingResult {
  /** Hours the plan asks for, minus anything already delivered. */
  hoursRequired: number;
  /** Hours the calendar contains between the two dates, holidays removed. */
  hoursAvailable: number;
  /** available - required. Negative means the plan does not fit. */
  slackHours: number;
  fits: boolean;
  sessionsAvailable: number;
  /** Teaching hours in one ordinary week, before holidays. */
  hoursPerWeek: number;
  /** Required hours split by what they are, so "cut practice" is a visible option. */
  byKind: Record<PlannedBlock["kind"], number>;
  /**
   * How many more hours a week would be needed to fit, rounded up to a
   * quarter hour. Zero when the plan already fits. This is the number
   * worth showing: "add 1.5 hours a week" is actionable in a way that
   * "you are 14 hours short" is not.
   */
  extraHoursPerWeekNeeded: number;
}

const MINUTES_PER_HOUR = 60;

/** `HH:MM` or `HH:MM:SS` to minutes since midnight. Throws on anything else. */
export function parseTimeToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) throw new Error(`Not a time: "${value}"`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`Not a time: "${value}"`);
  return hours * MINUTES_PER_HOUR + minutes;
}

/** How long one slot runs, in hours. A slot ending before it starts is zero, not negative. */
export function slotHours(slot: SessionSlot): number {
  const span = parseTimeToMinutes(slot.endTime) - parseTimeToMinutes(slot.startTime);
  return span > 0 ? span / MINUTES_PER_HOUR : 0;
}

/**
 * Which day of the week a `YYYY-MM-DD` date falls on in Asia/Kolkata.
 *
 * India is UTC+5:30 with no daylight saving, ever, so a date parsed at UTC
 * noon can never cross a boundary into the previous or next day — which is
 * exactly the bug that `new Date("2026-11-15").getDay()` produces for
 * anyone west of Greenwich. Noon, not midnight, is the whole trick.
 */
export function dayOfWeekIST(isoDate: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new Error(`Not a date: "${isoDate}"`);
  return new Date(`${isoDate}T12:00:00Z`).getUTCDay();
}

/** The next day, as `YYYY-MM-DD`. Same UTC-noon trick, same reason. */
export function nextDay(isoDate: string): string {
  const at = new Date(`${isoDate}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + 1);
  return at.toISOString().slice(0, 10);
}

/**
 * Every date between `from` and `to` inclusive on which the batch meets,
 * paired with the slot it meets in. Holidays are dropped.
 *
 * Capped at roughly three years of days. A typo in an end date
 * ("2206-11-15") would otherwise spin here rather than failing, and a
 * coordinator mistyping a year is a question of when, not if.
 */
export function meetingDates(
  slots: readonly SessionSlot[],
  fromDate: string,
  toDate: string,
  holidays: readonly string[] = [],
): Array<{ date: string; slot: SessionSlot }> {
  if (toDate < fromDate || slots.length === 0) return [];

  const skip = new Set(holidays);
  const byDay = new Map<number, SessionSlot[]>();
  for (const slot of slots) {
    const list = byDay.get(slot.dayOfWeek);
    if (list) list.push(slot);
    else byDay.set(slot.dayOfWeek, [slot]);
  }

  const out: Array<{ date: string; slot: SessionSlot }> = [];
  let cursor = fromDate;
  for (let guard = 0; guard < 1200 && cursor <= toDate; guard += 1) {
    if (!skip.has(cursor)) {
      for (const slot of byDay.get(dayOfWeekIST(cursor)) ?? []) {
        out.push({ date: cursor, slot });
      }
    }
    cursor = nextDay(cursor);
  }
  return out;
}

/** Rounds up to the next quarter hour. 1.01 becomes 1.25; 1.25 stays 1.25. */
function ceilToQuarter(hours: number): number {
  return Math.ceil(hours * 4 - 1e-9) / 4;
}

/** Guards against 0.30000000000000004 reaching a screen. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function assessPacing(input: PacingInput): PacingResult {
  const byKind: PacingResult["byKind"] = {
    teaching: 0,
    practice: 0,
    mock_test: 0,
    revision: 0,
  };
  for (const block of input.blocks) {
    byKind[block.kind] += block.hours;
  }

  const plannedTotal = Object.values(byKind).reduce((sum, hours) => sum + hours, 0);
  const hoursRequired = Math.max(0, plannedTotal - (input.hoursAlreadyTaught ?? 0));

  const meetings = meetingDates(
    input.slots,
    input.fromDate,
    input.teachingEndDate,
    input.holidays ?? [],
  );
  const hoursAvailable = meetings.reduce((sum, meeting) => sum + slotHours(meeting.slot), 0);
  const hoursPerWeek = input.slots.reduce((sum, slot) => sum + slotHours(slot), 0);

  const slackHours = hoursAvailable - hoursRequired;

  // Weeks, not days, and never less than one: dividing a shortfall by a
  // fortnight that is really three days produces a number that looks
  // survivable and is not.
  const weeksLeft = Math.max(1, meetings.length > 0 ? countWeeks(input.fromDate, input.teachingEndDate) : 1);
  const extraHoursPerWeekNeeded = slackHours >= 0 ? 0 : ceilToQuarter(-slackHours / weeksLeft);

  return {
    hoursRequired: round2(hoursRequired),
    hoursAvailable: round2(hoursAvailable),
    slackHours: round2(slackHours),
    fits: slackHours >= 0,
    sessionsAvailable: meetings.length,
    hoursPerWeek: round2(hoursPerWeek),
    byKind: {
      teaching: round2(byKind.teaching),
      practice: round2(byKind.practice),
      mock_test: round2(byKind.mock_test),
      revision: round2(byKind.revision),
    },
    extraHoursPerWeekNeeded,
  };
}

/** Whole-and-part weeks between two dates, inclusive. Used only for the "per week" figure. */
export function countWeeks(fromDate: string, toDate: string): number {
  if (toDate < fromDate) return 0;
  const from = new Date(`${fromDate}T12:00:00Z`).getTime();
  const to = new Date(`${toDate}T12:00:00Z`).getTime();
  const days = Math.round((to - from) / 86_400_000) + 1;
  return days / 7;
}
