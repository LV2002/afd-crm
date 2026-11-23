import { eq } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { enrolments, financeAccounts, payments } from "@/lib/db/schema";
import { centersServedBy } from "@/lib/finance/account-centers";
import { methodFromNarration } from "@/lib/finance/category-links";
import { postEntry } from "@/lib/finance/post";

/**
 * Money going back to a student, recorded from the bank line that shows it
 * leaving. It is a debit on the student's admission, so their "paid so far"
 * falls by that amount and the profile says they were refunded, and a
 * matching outgoing entry in the books, tied to that debit.
 *
 * Unlike `reversePayment`, this is not tied to one earlier payment: a refund
 * can be part of what was paid, or arrive in two goes. The bank line is the
 * proof it happened, so the date is the bank's and the entry is made here
 * rather than "today".
 */
export async function refundFromBankLine(
  tx: DbExecutor,
  input: {
    enrolmentId: string;
    amountPaise: number;
    accountId: string;
    occurredOn: string;
    narration: string;
    category: string;
    recordedBy: string | null;
  },
): Promise<{ paymentId: string; financeTransactionId: string }> {
  if (input.amountPaise <= 0) throw new Error("A refund must be more than zero.");
  const [enrolment] = await tx.select().from(enrolments).where(eq(enrolments.id, input.enrolmentId));
  if (!enrolment || enrolment.deletedAt) throw new Error("That admission no longer exists.");

  const [payment] = await tx
    .insert(payments)
    .values({
      enrolmentId: input.enrolmentId,
      amountPaise: input.amountPaise,
      direction: "debit",
      method: methodFromNarration(input.narration),
      reference: input.narration.slice(0, 120),
      reversalReason: "Refund to student, from the bank statement",
      receivedAt: new Date(`${input.occurredOn}T12:00:00+05:30`),
      recordedBy: input.recordedBy,
    })
    .returning({ id: payments.id });

  const [account] = await tx.select({ centerId: financeAccounts.centerId }).from(financeAccounts).where(eq(financeAccounts.id, input.accountId));
  const served = account ? await centersServedBy(tx, input.accountId, account.centerId) : [];

  const posted = await postEntry(tx, {
    occurredOn: input.occurredOn,
    direction: "out",
    kind: "fee",
    accountId: input.accountId,
    category: input.category,
    amountPaise: input.amountPaise,
    description: `Fee refund — ${input.narration.slice(0, 80)}`,
    paymentId: payment.id,
    enrolmentId: input.enrolmentId,
    studentId: enrolment.studentId,
    course: enrolment.course,
    centerId: served.includes(enrolment.centerId) ? enrolment.centerId : null,
    recordedBy: input.recordedBy,
    source: "bank_statement",
  });
  return { paymentId: payment.id, financeTransactionId: posted.id };
}
