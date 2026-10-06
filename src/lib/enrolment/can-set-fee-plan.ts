import "server-only";

import { eq } from "drizzle-orm";

import { can, type SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { payments } from "@/lib/db/schema";

/**
 * Who may set the fee and instalment plan.
 *
 * It used to be `enrolment.update` and nothing else, which is an accounts
 * permission — so the counsellor who had just sat with a family and
 * agreed three instalments in March could not record them, and accounts
 * had to be told the plan by message and type it in themselves. Leon's
 * instruction: *"I want the counsellor to enter this when a lead is being
 * marked as admission taken."*
 *
 * The rule that gives him that without handing counsellors the fee column
 * for ever:
 *
 * - **`enrolment.update`** — always, for anybody who holds it. This is
 *   accounts, and nothing about their job changes.
 * - **`enrolment.create`** — while **no money has been received** against
 *   the enrolment. That is the counsellor, in the window between
 *   confirming the admission and the first payment clearing, which is
 *   exactly the moment the plan is agreed.
 *
 * The first payment is the line because it is the point where the plan
 * stops being an intention and starts being something a ledger is
 * reconciled against. After it, a change to the schedule is an accounting
 * decision rather than a sales one, and `payments` is append-only
 * (non-negotiable #7) so the question has an exact answer rather than a
 * judgement.
 *
 * Nothing here touches the discount limits: `saveFeePlan` still routes a
 * discount beyond the counsellor's authority to approval, and this only
 * decides whether they may submit the form at all.
 */
export async function canSetFeePlan(
  user: SessionUser,
  enrolmentId: string | null,
): Promise<boolean> {
  if (can(user, "enrolment.update")) return true;
  if (!can(user, "enrolment.create")) return false;

  // No enrolment yet means nothing has been paid against one, so the
  // counsellor confirming the admission may set the plan as they go.
  if (!enrolmentId) return true;

  const [paid] = await db
    .select({ id: payments.id })
    .from(payments)
    // No `deleted_at` test: `payments` is append-only (non-negotiable
    // #7), so a row existing is the fact. A reversal is another row
    // rather than a deletion, and a reversed payment still means the
    // ledger has started — the plan is accounts' either way.
    .where(eq(payments.enrolmentId, enrolmentId))
    .limit(1);

  return !paid;
}

/** What to tell somebody the rule has just stopped. */
export const FEE_PLAN_LOCKED_MESSAGE =
  "A payment has already been received against this admission, so the fee plan is now accounts' to change. Ask them, and the reason will be on the record.";
