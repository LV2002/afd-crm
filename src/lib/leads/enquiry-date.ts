import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

const TIMEZONE = "Asia/Kolkata";

/** Earlier than this is a typo, not a backdated enquiry. */
const EARLIEST = new Date("2000-01-01T00:00:00Z");
/** A clock a minute or two ahead of the server is not "the future". */
const CLOCK_SLACK_MS = 5 * 60 * 1000;

/** What a `datetime-local` input wants, for an instant — in IST, not the browser's or server's zone. */
export function toISTInputValue(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return formatInTimeZone(date, TIMEZONE, "yyyy-MM-dd'T'HH:mm");
}

export type ParsedEnquiryDate = { ok: true; at: Date } | { ok: false; message: string };

/**
 * Turns what was typed into the `datetime-local` box (wall-clock time, read
 * as Kochi time) into the instant to store.
 *
 * Refuses the future: the point of the control is to fix a lead entered
 * late, and a date ahead of now would put it at the top of every "newest"
 * list and outside every report window until that day arrived.
 */
export function parseEnquiryDate(input: string, now: Date = new Date()): ParsedEnquiryDate {
  const trimmed = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    return { ok: false, message: "Enter the date and time the enquiry came in." };
  }
  const at = fromZonedTime(trimmed, TIMEZONE);
  if (Number.isNaN(at.getTime())) return { ok: false, message: "That is not a real date and time." };
  if (at.getTime() > now.getTime() + CLOCK_SLACK_MS) {
    return { ok: false, message: "The enquiry date can't be in the future." };
  }
  if (at < EARLIEST) return { ok: false, message: "That date is too far back to be right." };
  return { ok: true, at };
}
