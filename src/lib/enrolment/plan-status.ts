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
 * The instalments always cover the whole payable amount — the down payment
 * is instalment 1, due on the start date — so what the agreement prints adds
 * up to what the family owes. The rest is split evenly, monthly, with the
 * last instalment absorbing the rounding so nothing is ever a paisa out.
 */
export function suggestSchedule(input: {
  netPaise: number;
  downPaymentPaise: number;
  count: number;
  startDate: string;
}): ScheduleLine[] {
  const count = Math.min(Math.max(Math.floor(input.count), 1), INSTALMENT_SLOTS.length);
  const net = Math.max(0, Math.floor(input.netPaise));
  if (net === 0) return [];

  const down = Math.min(Math.max(0, Math.floor(input.downPaymentPaise)), net);
  const lines: ScheduleLine[] = [];

  let remaining = net;
  let slots = count;
  let sequence = 1;
  let month = 0;

  if (down > 0 && count > 1) {
    lines.push({ sequence: sequence++, dueDate: input.startDate, amountPaise: down });
    remaining -= down;
    slots -= 1;
    month = 1;
  }

  const each = Math.floor(remaining / slots);
  for (let i = 0; i < slots; i += 1) {
    const last = i === slots - 1;
    lines.push({
      sequence: sequence++,
      dueDate: addMonthsISO(input.startDate, month + i),
      amountPaise: last ? remaining - each * (slots - 1) : each,
    });
  }
  return lines;
}

export interface PlanStatus {
  /** A payable amount exists and the instalments add up to exactly it. */
  ready: boolean;
  scheduledPaise: number;
  /** First instalment not yet covered by what has been received, or null. */
  nextDue: { sequence: number; dueDate: string; amountPaise: number; overdue: boolean } | null;
}

/**
 * Where a plan stands. Money received is applied to the instalments in order,
 * the same way the agreed-plan table reads it, so "next due" is the first
 * instalment the running total has not yet reached.
 */
export function planStatus(input: {
  netPaise: number;
  instalments: ScheduleLine[];
  paidPaise: number;
  /** `YYYY-MM-DD`, the institute's today. */
  asOf: string;
}): PlanStatus {
  const ordered = [...input.instalments].sort((a, b) => a.sequence - b.sequence);
  const scheduledPaise = ordered.reduce((sum, i) => sum + i.amountPaise, 0);

  let covered = 0;
  let nextDue: PlanStatus["nextDue"] = null;
  for (const line of ordered) {
    covered += line.amountPaise;
    if (input.paidPaise < covered) {
      nextDue = { ...line, overdue: line.dueDate < input.asOf };
      break;
    }
  }

  return {
    ready: input.netPaise > 0 && scheduledPaise === input.netPaise,
    scheduledPaise,
    nextDue,
  };
}
