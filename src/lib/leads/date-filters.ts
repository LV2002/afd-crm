import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

const TZ = "Asia/Kolkata";

/**
 * The date filters on the leads list: when somebody arrived, and when
 * they are due to be followed up.
 *
 * ## Why this is a module and not four `.gte()` calls in the page
 *
 * Every one of these is a timezone question. "Leads from September" means
 * the 1st at midnight in Kochi to the 1st of October at midnight in
 * Kochi — which in stored UTC is 31 August 18:30 to 30 September 18:30.
 * Comparing against a plain `2026-09-01` would quietly drop the first
 * five and a half hours of every month and include five and a half hours
 * of the next one, and nobody would ever notice from the screen: the
 * count would simply be slightly wrong, for ever.
 *
 * "Overdue" is the same problem with teeth. A follow-up due at 9am today
 * is not overdue at 8am; a follow-up due yesterday is, from midnight IST,
 * not from midnight UTC five and a half hours later.
 *
 * Pure: a plain object of what the URL said in, instants out. No clock
 * of its own except the one passed in, so the tests can be about
 * boundaries rather than about today.
 */

export interface LeadDateFilterParams {
  /** `yyyy-MM-dd`, inclusive. */
  created_from?: string;
  /** `yyyy-MM-dd`, inclusive — the whole of that day counts. */
  created_to?: string;
  /** `yyyy-MM` — a whole month, and the easier thing to click than two dates. */
  created_month?: string;
  followup_from?: string;
  followup_to?: string;
  /**
   * A named window, for the questions that are asked constantly:
   * `overdue` (due before today and still open), `today`, `week` (the
   * next seven days), `none` (no follow-up booked at all).
   */
  followup?: string;
}

export interface LeadDateFilters {
  /** Half-open: `createdFrom <= created_at < createdTo`. */
  createdFrom: Date | null;
  createdTo: Date | null;
  followupFrom: Date | null;
  followupTo: Date | null;
  /** True when the filter is "has no follow-up booked", which is a null check, not a range. */
  followupMissing: boolean;
  /**
   * True only for "overdue". A lead that was won in March still carries
   * the follow-up date somebody booked in February, and a list of people
   * a counsellor is behind on should not open with twenty students who
   * already enrolled. The page supplies the terminal stage ids; this
   * module only says whether to exclude them.
   */
  excludeTerminalStages: boolean;
  /** True when at least one date filter is doing something — for the "clear" affordance. */
  active: boolean;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

/** Midnight IST on that date, as the UTC instant it really is. */
function startOfDay(date: string): Date {
  return fromZonedTime(`${date}T00:00:00`, TZ);
}

function startOfMonth(month: string): Date {
  return fromZonedTime(`${month}-01T00:00:00`, TZ);
}

/**
 * The month `step` months from this one, as `yyyy-MM`.
 *
 * Done on the month number rather than by adding to the instant, which
 * is the bug a test caught: 1 July in Kochi is stored as 30 June 18:30
 * UTC, and `addMonths` on that lands on 30 July — so "all of July"
 * finished a day early, every month whose IST start falls in the
 * previous UTC day. Integer arithmetic on the month cannot drift.
 */
function shiftMonth(month: string, step: number): string {
  const [year, index] = month.split("-").map(Number);
  const zeroBased = (year * 12 + (index - 1)) + step;
  return `${Math.floor(zeroBased / 12)}-${String((zeroBased % 12) + 1).padStart(2, "0")}`;
}

/** Midnight IST today, from whatever instant "now" is. */
export function startOfTodayIST(now: Date): Date {
  return startOfDay(formatInTimeZone(now, TZ, "yyyy-MM-dd"));
}

export function parseLeadDateFilters(
  params: LeadDateFilterParams,
  now = new Date(),
): LeadDateFilters {
  let createdFrom: Date | null = null;
  let createdTo: Date | null = null;

  // A month is a shortcut for a pair of dates, and it wins when both are
  // given: somebody who has just clicked "September" means September,
  // whatever was in the boxes before.
  if (params.created_month && MONTH.test(params.created_month)) {
    createdFrom = startOfMonth(params.created_month);
    createdTo = startOfMonth(shiftMonth(params.created_month, 1));
  } else {
    if (params.created_from && DATE.test(params.created_from)) {
      createdFrom = startOfDay(params.created_from);
    }
    if (params.created_to && DATE.test(params.created_to)) {
      // The day named in "to" is included in full, so the boundary is the
      // start of the next one. A range of 1st to 1st is one whole day,
      // not nothing, which is what a naive `<= 1st 00:00` would give.
      createdTo = addDays(startOfDay(params.created_to), 1);
    }
  }

  let followupFrom: Date | null = null;
  let followupTo: Date | null = null;
  let followupMissing = false;

  const today = startOfTodayIST(now);

  switch (params.followup) {
    case "overdue":
      // Everything before midnight this morning. No lower bound: a
      // follow-up booked for last March and never done is the most
      // overdue thing there is, and a window would hide it.
      followupTo = today;
      break;
    case "today":
      followupFrom = today;
      followupTo = addDays(today, 1);
      break;
    case "week":
      followupFrom = today;
      followupTo = addDays(today, 7);
      break;
    case "none":
      followupMissing = true;
      break;
    default:
      if (params.followup_from && DATE.test(params.followup_from)) {
        followupFrom = startOfDay(params.followup_from);
      }
      if (params.followup_to && DATE.test(params.followup_to)) {
        followupTo = addDays(startOfDay(params.followup_to), 1);
      }
  }

  return {
    createdFrom,
    createdTo,
    followupFrom,
    followupTo,
    followupMissing,
    excludeTerminalStages: params.followup === "overdue",
    active:
      createdFrom !== null ||
      createdTo !== null ||
      followupFrom !== null ||
      followupTo !== null ||
      followupMissing,
  };
}

/** The last N months as `yyyy-MM` plus a readable label, newest first — for the month picker. */
export function recentMonths(now: Date, count = 12): Array<{ value: string; label: string }> {
  const thisMonth = formatInTimeZone(now, TZ, "yyyy-MM");
  return Array.from({ length: count }, (_, i) => {
    const value = shiftMonth(thisMonth, -i);
    return { value, label: formatInTimeZone(startOfMonth(value), TZ, "MMMM yyyy") };
  });
}

interface RangeQuery {
  gte(column: string, value: unknown): this;
  lt(column: string, value: unknown): this;
  is(column: string, value: unknown): this;
}

/** Applies the parsed filters to a `leads` query. Narrowing only — RLS is the boundary. */
export function applyLeadDateFilters<Q extends RangeQuery>(query: Q, filters: LeadDateFilters): Q {
  let next = query;
  if (filters.createdFrom) next = next.gte("created_at", filters.createdFrom.toISOString());
  if (filters.createdTo) next = next.lt("created_at", filters.createdTo.toISOString());
  if (filters.followupMissing) {
    next = next.is("next_followup_at", null);
  } else {
    if (filters.followupFrom) next = next.gte("next_followup_at", filters.followupFrom.toISOString());
    if (filters.followupTo) next = next.lt("next_followup_at", filters.followupTo.toISOString());
  }
  return next;
}
