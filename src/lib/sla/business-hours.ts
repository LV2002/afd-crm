import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/**
 * docs/01-DATA-MODEL.md § SLA policies: "the SLA clock pauses outside
 * working hours and on holidays." One row per day-of-week for a centre;
 * a day-of-week with no row at all is treated as closed (a safer default
 * than assuming 24/7 for a day nobody configured).
 */
export interface DayHours {
  /** 0 = Sunday .. 6 = Saturday, matching business_hours.day_of_week. */
  dayOfWeek: number;
  /** "HH:MM:SS", as Postgres returns a `time` column. */
  opensAt: string | null;
  closesAt: string | null;
  isClosed: boolean;
}

/** Pure calendar-date arithmetic — deliberately not timezone math, so it's correct regardless of the target zone's DST rules. */
function nextLocalDate(dateStr: string): string {
  const noonUtc = new Date(`${dateStr}T12:00:00Z`);
  return addDays(noonUtc, 1).toISOString().slice(0, 10);
}

function dayOfWeekFor(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

/**
 * Hours of business-hours time that elapsed between `start` and `end`,
 * for one centre — the SLA clock CLAUDE.md/the data model doc describes,
 * which pauses outside opening hours and on holidays rather than counting
 * wall-clock time straight through. `start`/`end` are UTC instants;
 * `businessHours`/`holidayDates` describe the centre's own local
 * calendar via `timeZone` (per-centre, e.g. "Asia/Kolkata").
 *
 * Walks one local calendar day at a time (bounded — see the guard below)
 * rather than doing a single subtraction, since a real "pause the clock"
 * calculation has to know which parts of each day were open.
 */
export function computeBusinessHoursElapsed(
  start: Date,
  end: Date,
  businessHours: DayHours[],
  holidayDates: ReadonlySet<string>,
  timeZone: string,
): number {
  if (end <= start) return 0;

  const hoursByDay = new Map(businessHours.map((h) => [h.dayOfWeek, h]));
  let totalMs = 0;

  let dateStr = formatInTimeZone(start, timeZone, "yyyy-MM-dd");
  const endDateStr = formatInTimeZone(end, timeZone, "yyyy-MM-dd");

  // Safety cap so a caller bug (e.g. `end` far in the future) can't turn
  // this into an unbounded loop — ~5.5 years of days is far past anything
  // a real SLA target would ever need.
  for (let guard = 0; guard < 2000; guard++) {
    if (!holidayDates.has(dateStr)) {
      const hours = hoursByDay.get(dayOfWeekFor(dateStr));
      if (hours && !hours.isClosed && hours.opensAt && hours.closesAt) {
        const openInstant = fromZonedTime(`${dateStr}T${hours.opensAt}`, timeZone);
        const closeInstant = fromZonedTime(`${dateStr}T${hours.closesAt}`, timeZone);
        const overlapStart = openInstant > start ? openInstant : start;
        const overlapEnd = closeInstant < end ? closeInstant : end;
        if (overlapEnd > overlapStart) {
          totalMs += overlapEnd.getTime() - overlapStart.getTime();
        }
      }
    }

    if (dateStr === endDateStr) break;
    dateStr = nextLocalDate(dateStr);
  }

  return totalMs / (1000 * 60 * 60);
}
