/**
 * When a broadcast goes out.
 *
 * Leon's ask, in his words: compose it now, have it leave on Tuesday at
 * ten. Marketing messages land differently at 10am on a weekday than at
 * 11pm on the night somebody happened to write them, and until now the
 * only send time available was "the moment you press the button".
 *
 * Pure, and tested, because the time zone is the whole problem. A person
 * in Kochi types "10:00" and means 10:00 IST; the server, the database
 * and Vercel's cron all live in UTC. Every conversion goes through
 * date-fns-tz with an explicit Asia/Kolkata, never through the runtime's
 * own idea of local time — that is correct on a laptop in Kerala and
 * five and a half hours wrong in production.
 */

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

const TIMEZONE = "Asia/Kolkata";

/** What `<input type="datetime-local">` produces: `2026-09-08T10:00`. */
const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/**
 * A year. Long enough for "send this on results day", short enough that a
 * typo in the year field is caught rather than queued until 2226.
 */
export const MAX_DAYS_AHEAD = 365;

export interface ScheduleParse {
  /** The UTC instant to send at. Absent when `error` is set. */
  at?: Date;
  error?: string;
}

/**
 * Reads the composer's date-and-time box as Asia/Kolkata wall-clock time.
 *
 * Refuses a time in the past rather than silently sending immediately:
 * somebody who typed last Tuesday meant next Tuesday, and finding out by
 * having the campaign go out at once is not a recoverable mistake.
 */
export function parseScheduleAt(local: string, now: Date): ScheduleParse {
  const trimmed = local.trim();
  if (!trimmed) return { error: "Pick the date and time it should go out." };
  if (!LOCAL_DATETIME.test(trimmed)) return { error: "That date and time isn't readable." };

  const at = fromZonedTime(trimmed, TIMEZONE);
  if (Number.isNaN(at.getTime())) return { error: "That date and time isn't readable." };

  if (at.getTime() <= now.getTime()) {
    return {
      error: "That time has already passed — pick a time in the future.",
    };
  }

  const daysAhead = (at.getTime() - now.getTime()) / 86_400_000;
  if (daysAhead > MAX_DAYS_AHEAD) {
    return {
      error: `Nothing can be scheduled more than ${MAX_DAYS_AHEAD} days ahead.`,
    };
  }

  return { at };
}

/** "Tue 8 Sep 2026, 10:00 am" — IST, always, wherever this renders. */
export function describeSchedule(at: Date | string): string {
  const date = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(date.getTime())) return "—";
  return formatInTimeZone(date, TIMEZONE, "EEE d MMM yyyy, h:mm a");
}

/** The value to put back into a `datetime-local` box so editing shows IST, not UTC. */
export function toLocalInputValue(at: Date | string): string {
  const date = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(date.getTime())) return "";
  return formatInTimeZone(date, TIMEZONE, "yyyy-MM-dd'T'HH:mm");
}

/**
 * Whether a scheduled broadcast's moment has arrived.
 *
 * `<=`, not `===` on a minute: the sweep runs on a cron, so it will
 * almost never be looking at exactly the scheduled minute, and a
 * broadcast whose time passed while nobody was looking must still go —
 * late — rather than never. The same reasoning as the payment reminder
 * ladder's `>=`, and for the same reason: a missed run is a normal event,
 * not an exceptional one.
 */
export function isDue(scheduledFor: Date | string | null, now: Date): boolean {
  if (!scheduledFor) return false;
  const at = typeof scheduledFor === "string" ? new Date(scheduledFor) : scheduledFor;
  if (Number.isNaN(at.getTime())) return false;
  return at.getTime() <= now.getTime();
}

/**
 * How often the job that actually sends runs, in words, for the composer
 * to say out loud.
 *
 * Scheduling is only ever as precise as this. It lives here, in one
 * place, because the truth of it is a line in `vercel.json` and a screen
 * that quietly disagrees with that line is worse than a screen that says
 * nothing: somebody schedules a message for Tuesday morning, it leaves on
 * Sunday, and they stop trusting the feature.
 *
 * AFD's hosting plan allows one cron a day at most, and the broadcast
 * sweep is currently set to Sunday ("0 1 * * 0"). Raising that line to a
 * quarter-hourly schedule makes scheduling accurate to the minute and
 * needs nothing else changed — including this sentence, which should then
 * read "every fifteen minutes".
 */
export const SWEEP_CADENCE_NOTE =
  "The job that actually sends currently runs once a week, early on Sunday. A broadcast goes out at the first run after the time you pick — so the time you set is the EARLIEST it can leave, not the exact moment.";

/**
 * A sensible default for the picker: tomorrow at 10am IST.
 *
 * Not "in an hour". The reason to schedule at all is to land in working
 * hours, and 10am is when a message about a course gets read rather than
 * dismissed.
 */
export function defaultScheduleValue(now: Date): string {
  const today = formatInTimeZone(now, TIMEZONE, "yyyy-MM-dd");
  const tomorrow = new Date(fromZonedTime(`${today}T10:00`, TIMEZONE).getTime() + 86_400_000);
  return toLocalInputValue(tomorrow);
}
