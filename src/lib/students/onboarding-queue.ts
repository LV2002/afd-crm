import { startOfDayIST } from "@/lib/format/date";

/**
 * How long a student has been waiting for academics to onboard them.
 *
 * ## Calendar days, not elapsed hours
 *
 * Somebody whose payment cleared at 9pm yesterday has been waiting *a day*
 * — that is how anybody in the office would describe it, and it is the
 * difference between a queue that reads honestly and one that says "0 days"
 * about a person who has been ignored since last night. Rounding elapsed
 * hours would give 0 for the 9pm case and 1 for an 11am one on the same
 * morning.
 *
 * ## And in IST
 *
 * The boundary is midnight in Kochi, not midnight on Vercel's UTC clock.
 * Between 00:00 and 05:30 UTC the two disagree, so a server-local
 * subtraction would quietly under-count every night.
 */
export function daysWaiting(joinedAt: string | Date, now: Date = new Date()): number {
  const joined = typeof joinedAt === "string" ? new Date(joinedAt) : joinedAt;
  if (Number.isNaN(joined.getTime())) return 0;

  const then = startOfDayIST(joined).getTime();
  const today = startOfDayIST(now).getTime();
  // Negative would mean a payment timestamped in the future — a clock skew,
  // not a student who has waited a negative number of days.
  return Math.max(0, Math.round((today - then) / 86_400_000));
}

/**
 * How loudly the queue should shout about one row.
 *
 * Three days is the line, and it is a judgement rather than a measurement:
 * a student who paid on Friday and has heard nothing by Monday has had a
 * bad first experience of the institute, and that is the one worth marking
 * in red. Everything fresher is simply the queue working.
 */
export function waitingBand(days: number): "fresh" | "overdue" {
  return days >= 3 ? "overdue" : "fresh";
}
