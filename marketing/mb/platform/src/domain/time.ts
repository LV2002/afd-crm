import { err, ok, type Result } from './result.ts';

const IST = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

// Stored values are UTC; people only ever see India time.
export const formatIst = (date: Date): string => IST.format(date);

// A timestamp with no zone would be read in the machine's local zone, so it is refused.
export function parseUtc(text: string): Result<Date, string> {
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(text)) return err(`timestamp has no zone: ${text}`);
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? err(`not a timestamp: ${text}`) : ok(date);
}

const IST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
// Today's date in India as yyyy-mm-dd.
export const istDate = (date: Date): string => IST_DAY.format(date);

const MS_PER_DAY = 86_400_000;
// Whole days from today (India) to a yyyy-mm-dd date; negative once it has passed.
export const daysUntil = (isoDate: string, now: Date): number => Math.round((Date.parse(`${isoDate}T00:00:00Z`) - Date.parse(`${istDate(now)}T00:00:00Z`)) / MS_PER_DAY);
