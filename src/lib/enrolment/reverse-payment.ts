import { and, eq, isNull } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { enrolments, financeTransactions, payments, receipts } from "@/lib/db/schema";
import { FEE_CATEGORY, postEntry, reverseTransaction } from "@/lib/finance/post";

/**
 * The missing half of an append-only ledger.
 *
 * `payments` has had `direction: 'debit'`, `reverses_payment_id` and
 * `reversal_reason` since Phase 4. The receipt page has been able to
 * print a "Refund / Reversal Note" for just as long. `payment.refund` has
 * been granted to accounts and administrators the whole time. And nothing
 * anywhere could write the row — so the one correction the design
 * explicitly allows was the one thing staff could not do, while the
 * manual told them to do it.
 *
 * ## Reversal and refund are not the same thing
 *
 * A **reversal** says the payment never happened: wrong student, wrong
 * amount, typed twice. The money never arrived, so the cash entry it
 * created was wrong too and is reversed at its original date — the
 * institute's bank balance for that day goes back to what it really was.
 *
 * A **refund** says the payment did happen and the money is going back.
 * The original entry stands, because it was true; a new outgoing entry is
 * posted today, because that is when the cash actually leaves. Collapsing
 * the two would misstate the cash position on both days.
 *
 * Both insert the same debit against the enrolment, so the student's
 * balance is right either way. The difference is entirely in the ledger,
 * which is exactly where it matters.
 *
 * ## What it deliberately does not do
 *
 * **It does not undo Gate 2.** Reversing a student's first payment does
 * not delete their `students` row or clear `accounts_to_academics_at`.
 * They were handed to academics, who may well have taught them a class by
 * now; a gate is a thing that happened, not a thing that is currently
 * true. A student who is actually leaving is marked dropped, which is its
 * own action with its own reason.
 *
 * **It does not issue a receipt number.** The reversal is numbered on the
 * ledger side (`txn_no`) and the note prints without one. Putting refunds
 * into the same gapless sequence as fee receipts would make "receipt #412"
 * sometimes mean money in and sometimes money out, which is worse than a
 * note with no number.
 */

export type PaymentMethod = "cash" | "upi" | "card" | "neft" | "cheque" | "other";

export interface ReversePaymentInput {
  /** The original credit being undone. */
  paymentId: string;
  kind: "reversal" | "refund";
  /** Required, and printed on the note. */
  reason: string;
  recordedBy: string | null;
  /** How the money went back. Refunds only; a reversal moved no money. */
  method?: PaymentMethod;
  /** Which account it left from. Refunds only. */
  accountId?: string | null;
}

export interface ReversePaymentResult {
  reversalPaymentId: string;
  enrolmentId: string;
  amountPaise: number;
  financeTransactionId: string | null;
}

export async function reversePayment(
  tx: DbExecutor,
  input: ReversePaymentInput,
): Promise<ReversePaymentResult> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Say why — it prints on the note and stays on the record.");

  const [original] = await tx.select().from(payments).where(eq(payments.id, input.paymentId));
  if (!original) throw new Error("That payment no longer exists.");
  if (original.direction !== "credit") {
    throw new Error("That entry is itself a reversal, so it cannot be reversed.");
  }

  // One reversal per payment. Without this, two people on the same screen
  // both pressing the button takes the balance twice as far down as it
  // should go, and the ledger has no way to tell which one was wrong.
  const [already] = await tx
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.reversesPaymentId, original.id));
  if (already) throw new Error("That payment has already been reversed or refunded.");

  const [enrolment] = await tx
    .select()
    .from(enrolments)
    .where(eq(enrolments.id, original.enrolmentId));
  if (!enrolment) throw new Error("That admission no longer exists.");

  if (input.kind === "refund" && !input.accountId) {
    throw new Error("Say which account the refund is paid from.");
  }

  const [reversal] = await tx
    .insert(payments)
    .values({
      enrolmentId: original.enrolmentId,
      amountPaise: original.amountPaise,
      direction: "debit",
      // A reversal moved no money, so it keeps the original's method for
      // the record. A refund went back some way, which the form asks for.
      method: input.kind === "refund" ? (input.method ?? original.method) : original.method,
      reference: original.reference,
      reversesPaymentId: original.id,
      reversalReason: reason,
      recordedBy: input.recordedBy,
    })
    .returning({ id: payments.id });

  const [receipt] = await tx
    .select({ receiptNo: receipts.receiptNo })
    .from(receipts)
    .where(eq(receipts.paymentId, original.id));

  let financeTransactionId: string | null = null;

  if (input.kind === "reversal") {
    // The cash entry the original payment created, if it made one.
    // Payments recorded before the ledger existed have none, and a
    // reversal of one of those is still a valid correction to the
    // student's balance — it just has no cash side to undo.
    const [posted] = await tx
      .select({ id: financeTransactions.id })
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.paymentId, original.id),
          isNull(financeTransactions.reversesTransactionId),
        ),
      );
    if (posted) {
      const result = await reverseTransaction(tx, {
        transactionId: posted.id,
        reason,
        recordedBy: input.recordedBy,
        source: "payment-reversal",
      });
      financeTransactionId = result.reversal.id;
    }
  } else {
    const posted = await postEntry(tx, {
      // Today, not the original payment's date: this is when the money
      // actually leaves, and dating it backwards would restate a bank
      // balance that was correct at the time.
      occurredOn: new Date().toISOString().slice(0, 10),
      direction: "out",
      kind: "fee",
      accountId: input.accountId!,
      category: FEE_CATEGORY,
      amountPaise: original.amountPaise,
      description: receipt
        ? `Fee refund — against receipt #${receipt.receiptNo}`
        : "Fee refund",
      reference: original.reference,
      paymentId: reversal.id,
      enrolmentId: original.enrolmentId,
      studentId: enrolment.studentId,
      course: enrolment.course,
      recordedBy: input.recordedBy,
      source: "payment-refund",
    });
    financeTransactionId = posted.id;
  }

  return {
    reversalPaymentId: reversal.id,
    enrolmentId: original.enrolmentId,
    amountPaise: original.amountPaise,
    financeTransactionId,
  };
}
