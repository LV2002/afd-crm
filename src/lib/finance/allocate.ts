/**
 * Which payment settled which instalment.
 *
 * The CRM records what a student agreed to pay (`enrolment_instalments`)
 * and what actually arrived (`payments`), but nothing joins the two. The
 * workbook had an Allocations sheet doing exactly this, and every useful
 * question depends on it: what is still owed, what is overdue, whether
 * people pay on time.
 *
 * Derived, not stored. The workbook wrote allocation rows and had to unwind
 * them on every reversal — a second set of numbers to keep in step with the
 * first. Computing it from the two append-only tables means it is always
 * right by construction, and a reversal needs no cleanup at all: the
 * reversing payment simply reduces the pot being allocated.
 *
 * Pure, so the arithmetic that tells a student what they still owe is
 * testable without a database.
 */

export interface ScheduledInstalment {
  id: string;
  sequence: number;
  dueDate: string;
  amountPaise: number;
}

export interface ReceivedPayment {
  id: string;
  /** `YYYY-MM-DD`. */
  receivedOn: string;
  /** Positive for a credit, negative for a reversal or refund. */
  amountPaise: number;
}

export interface SettledInstalment extends ScheduledInstalment {
  paidPaise: number;
  outstandingPaise: number;
  /** The date the last rupee of this instalment arrived. Null while unpaid. */
  settledOn: string | null;
  status: "paid" | "overdue" | "due_soon" | "upcoming";
}

export interface AllocationResult {
  instalments: SettledInstalment[];
  /** Money received beyond the whole schedule. A student who has overpaid. */
  surplusPaise: number;
  scheduledPaise: number;
  paidPaise: number;
  outstandingPaise: number;
}

const DAY = 86_400_000;

/**
 * Fills the oldest unpaid instalment first, then carries forward — the
 * same rule the workbook used, and the one every institute means when they
 * say "put it against what's outstanding".
 *
 * Payments are applied in date order so the settlement dates come out
 * right: if a student pays instalment 2 early and instalment 1 late, the
 * first rupees in still settle instalment 1, which is what actually
 * happened commercially.
 *
 * Reversals and refunds are negative, so they reduce the pot before it is
 * spread. A reversed payment therefore un-settles the instalment it had
 * covered, with no special case anywhere.
 */
export function allocatePayments(
  instalments: ScheduledInstalment[],
  paymentsIn: ReceivedPayment[],
  asOf: string,
): AllocationResult {
  const ordered = [...instalments].sort(
    (a, b) => a.sequence - b.sequence || a.dueDate.localeCompare(b.dueDate),
  );
  const byDate = [...paymentsIn].sort((a, b) => a.receivedOn.localeCompare(b.receivedOn));

  const total = byDate.reduce((sum, p) => sum + p.amountPaise, 0);
  let remaining = Math.max(0, total);

  // Walking the payments alongside the instalments gives each settlement
  // the date of the payment that actually completed it, which is what the
  // timeliness report measures.
  let paymentIndex = 0;
  let withinPayment = byDate[0] ? Math.max(0, byDate[0].amountPaise) : 0;

  const settled: SettledInstalment[] = ordered.map((instalment) => {
    const apply = Math.min(remaining, instalment.amountPaise);
    remaining -= apply;

    let settledOn: string | null = null;
    if (apply >= instalment.amountPaise && apply > 0) {
      let stillNeeded = instalment.amountPaise;
      while (stillNeeded > 0 && paymentIndex < byDate.length) {
        const take = Math.min(stillNeeded, withinPayment);
        stillNeeded -= take;
        withinPayment -= take;
        settledOn = byDate[paymentIndex].receivedOn;
        if (withinPayment <= 0) {
          paymentIndex += 1;
          withinPayment = byDate[paymentIndex]
            ? Math.max(0, byDate[paymentIndex].amountPaise)
            : 0;
        }
      }
    }

    const outstandingPaise = instalment.amountPaise - apply;
    return {
      ...instalment,
      paidPaise: apply,
      outstandingPaise,
      settledOn,
      status: statusOf(instalment.dueDate, outstandingPaise, asOf),
    };
  });

  const scheduledPaise = ordered.reduce((sum, i) => sum + i.amountPaise, 0);
  const paidPaise = Math.max(0, total);

  return {
    instalments: settled,
    surplusPaise: remaining,
    scheduledPaise,
    paidPaise,
    outstandingPaise: scheduledPaise - Math.min(paidPaise, scheduledPaise),
  };
}

/**
 * "Due soon" is seven days out, matching the workbook. It exists so a
 * collections list has something actionable at the top rather than only
 * telling you what is already late.
 */
function statusOf(
  dueDate: string,
  outstandingPaise: number,
  asOf: string,
): SettledInstalment["status"] {
  if (outstandingPaise <= 0) return "paid";
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  const now = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(due) || Number.isNaN(now)) return "upcoming";
  if (due < now) return "overdue";
  if (due <= now + 7 * DAY) return "due_soon";
  return "upcoming";
}

/**
 * Where a student stands overall — the workbook's Students-sheet status
 * column, which an admin looks at before ringing anybody.
 *
 * Overpaid is called out rather than folded into "paid": money received
 * beyond the schedule is a real thing that needs a human to look at it,
 * either a refund or a correction, and silently showing a green tick would
 * bury it.
 */
export function studentStanding(result: AllocationResult): "overpaid" | "paid" | "overdue" | "on_track" {
  if (result.surplusPaise > 0) return "overpaid";
  if (result.outstandingPaise <= 0) return "paid";
  if (result.instalments.some((i) => i.status === "overdue")) return "overdue";
  return "on_track";
}
