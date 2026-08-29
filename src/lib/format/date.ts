import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/** Asia/Kolkata everywhere user-facing, per CLAUDE.md — timestamps are stored UTC, always displayed IST. */
const DISPLAY_TIMEZONE = "Asia/Kolkata";

export function formatDateIST(value: string | Date | null | undefined, pattern: string): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return formatInTimeZone(date, DISPLAY_TIMEZONE, pattern);
}

/**
 * The UTC instant of the start of "today" in IST, for a given moment. Used
 * to bucket due dates into overdue/due-today/later without ever comparing
 * against the server's own (UTC, on Vercel) midnight — "due today" must
 * mean today in Kochi and Kannur, not today in UTC. IST has a fixed
 * +05:30 offset with no DST, so simple 24h arithmetic on the result
 * (see startOfTomorrowIST) is always correct, unlike most other time zones.
 */
export function startOfDayIST(instant: Date): Date {
  const dateStr = formatInTimeZone(instant, DISPLAY_TIMEZONE, "yyyy-MM-dd");
  return fromZonedTime(`${dateStr}T00:00:00`, DISPLAY_TIMEZONE);
}

export function startOfTomorrowIST(instant: Date): Date {
  return addDays(startOfDayIST(instant), 1);
}
