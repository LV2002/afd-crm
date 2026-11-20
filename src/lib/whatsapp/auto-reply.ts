import { formatInTimeZone } from "date-fns-tz";

/**
 * Greeting and away messages: pure decisions, no I/O.
 *
 * Away wins over greeting — somebody writing at midnight should hear that
 * the office is closed, not "a counsellor will reply shortly". Neither is
 * ever sent twice in a row to the same number: away at most once per 12
 * hours, greeting only to a fresh conversation (no earlier message from
 * them in the last 24 hours).
 */

export interface AutoReplyConfig {
  kind: "greeting" | "away";
  enabled: boolean;
  message: string;
  /** 0 = Sunday … 6 = Saturday. */
  days: number[];
  opensAt: string;
  closesAt: string;
}

export const AWAY_REPEAT_HOURS = 12;
export const GREETING_QUIET_HOURS = 24;
const TZ = "Asia/Kolkata";

/** Whether the office is open at `now` (IST) under this config's days and hours. */
export function isOpenNow(config: Pick<AutoReplyConfig, "days" | "opensAt" | "closesAt">, now: Date): boolean {
  const day = Number(formatInTimeZone(now, TZ, "i")) % 7; // ISO 1..7 (Mon..Sun) → 1..6,0
  if (!config.days.includes(day)) return false;
  const time = formatInTimeZone(now, TZ, "HH:mm");
  return time >= config.opensAt && time < config.closesAt;
}

export interface AutoReplyInput {
  now: Date;
  /** The message before the one just received, or null if there was none. */
  previousInboundAt: Date | null;
  lastSent: { greeting: Date | null; away: Date | null };
  configs: AutoReplyConfig[];
}

export function decideAutoReply(input: AutoReplyInput): AutoReplyConfig | null {
  const away = input.configs.find((c) => c.kind === "away" && c.enabled && c.message.trim());
  const greeting = input.configs.find((c) => c.kind === "greeting" && c.enabled && c.message.trim());
  const hours = (a: Date, b: Date) => (a.getTime() - b.getTime()) / 3_600_000;

  if (away && !isOpenNow(away, input.now)) {
    const last = input.lastSent.away;
    return last && hours(input.now, last) < AWAY_REPEAT_HOURS ? null : away;
  }
  if (greeting) {
    const fresh = !input.previousInboundAt || hours(input.now, input.previousInboundAt) >= GREETING_QUIET_HOURS;
    const last = input.lastSent.greeting;
    if (fresh && !(last && hours(input.now, last) < GREETING_QUIET_HOURS)) return greeting;
  }
  return null;
}
