import { formatInTimeZone } from "date-fns-tz";

/** Asia/Kolkata everywhere user-facing, per CLAUDE.md — timestamps are stored UTC, always displayed IST. */
const DISPLAY_TIMEZONE = "Asia/Kolkata";

export function formatDateIST(value: string | Date | null | undefined, pattern: string): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return formatInTimeZone(date, DISPLAY_TIMEZONE, pattern);
}
