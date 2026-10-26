import { INSTALMENT_SLOTS } from "./instalment-plan";

/**
 * Pure helpers for the counsellor → accountant hand-over of a fee plan.
 * No database, so the arithmetic is testable on its own.
 */

export interface ScheduleLine {
  sequence: number;
  /** `YYYY-MM-DD`. */
  dueDate: string;
  amountPaise: number;
}

/** `YYYY-MM-DD` plus whole months, clamped to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonthsISO(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * A starting schedule a counsellor can adjust.
 *
 * The down payment is separate from the instalments — it is collected at
 * joining, and the instalments split whatever is left of the payable
 * amount, evenly and a month apart starting at `startDate`, with the last
 * one absorbing the rounding so nothing is ever a paisa out.
 */
export function suggestSchedule(input: {
  netPaise: number;
  downPaymentPaise: number;
  count: number;
  startDate: string;
}): ScheduleLine[] {
  const count = Math.min(Math.max(Math.floor(input.count), 1), INSTALMENT_SLOTS.length);
  const net = Math.max(0, Math.floor(input.netPaise));
  const down = Math.min(Math.max(0, Math.floor(input.downPaymentPaise)), net);
  const remaining = net - down;
  if (remaining === 0) return [];

  const each = Math.floor(remaining / count);
  const lines: ScheduleLine[] = [];
  for (let i = 0; i < count; i += 1) {
    const last = i === count - 1;
    lines.push({
      sequence: i + 1,
      dueDate: addMonthsISO(input.startDate, i),
      amountPaise: last ? remaining - each * (count - 1) : each,
    });
  }
  return lines;
}

export interface PlanStatus {
  /** A payable amount exists and the down payment plus instalments add up to exactly it. */
  ready: boolean;
  scheduledPaise: number;
  /** First amount (sequence 0 is the down payment) not yet covered by what has been received, or null. */
  nextDue: {
    sequence: number;
    dueDate: string;
    amountPaise: number;
    /** What is still unpaid of that line — less than `amountPaise` after a part-payment. */
    outstandingPaise: number;
    overdue: boolean;
  } | null;
}

/**
 * Where a plan stands. The down payment counts as the first amount due (on
 * the day the admission was confirmed), then the instalments; money received
 * is applied in that order, the same way the agreed-plan table reads it, so
 * "next due" is the first line the running total has not yet reached.
 */
export function planStatus(input: {
  netPaise: number;
  downPaymentPaise?: number;
  /** `YYYY-MM-DD` the down payment fell due; defaults to `asOf`. */
  downPaymentDueDate?: string;
  instalments: ScheduleLine[];
  paidPaise: number;
  /** `YYYY-MM-DD`, the institute's today. */
  asOf: string;
}): PlanStatus {
  const down = input.downPaymentPaise ?? 0;
  const ordered = [...input.instalments].sort((a, b) => a.sequence - b.sequence);
  const lines: ScheduleLine[] =
    down > 0
      ? [
          { sequence: 0, dueDate: input.downPaymentDueDate ?? input.asOf, amountPaise: down },
          ...ordered,
        ]
      : ordered;
  const scheduledPaise = lines.reduce((sum, i) => sum + i.amountPaise, 0);

  let covered = 0;
  let nextDue: PlanStatus["nextDue"] = null;
  for (const line of lines) {
    covered += line.amountPaise;
    if (input.paidPaise < covered) {
      nextDue = {
        ...line,
        outstandingPaise: covered - Math.max(0, input.paidPaise),
        overdue: line.dueDate < input.asOf,
      };
      break;
    }
  }

  return {
    ready: input.netPaise > 0 && scheduledPaise === input.netPaise,
    scheduledPaise,
    nextDue,
  };
}

/**
 * When the down payment (or lump sum) is due: the date the counsellor agreed
 * with the family, or — when none was given — the day the admission was
 * confirmed, which is how every plan saved before the date existed reads.
 */
export function effectiveDownPaymentDue(
  agreedDate: string | null | undefined,
  confirmedAt: string | Date | null | undefined,
  fallback: string,
): string {
  if (agreedDate) return agreedDate.slice(0, 10);
  if (confirmedAt) {
    return (confirmedAt instanceof Date ? confirmedAt.toISOString() : confirmedAt).slice(0, 10);
  }
  return fallback;
}
