import { and, eq, isNull } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { enrolments, leads, payments, receipts, students } from "@/lib/db/schema";

export interface RecordPaymentInput {
  enrolmentId: string;
  amountPaise: number;
  method: "cash" | "upi" | "card" | "neft" | "cheque" | "other";
  reference?: string | null;
  recordedBy: string | null;
}

export interface RecordPaymentResult {
  paymentId: string;
  receiptId: string;
  receiptNo: number;
  isFirstPayment: boolean;
  studentId: string | null;
}

/**
 * Records one credit against an enrolment. CLAUDE.md non-negotiable #7:
 * this only ever inserts — payments/receipts have no UPDATE/DELETE policy
 * anywhere (migration 0017), and this function doesn't try to work around
 * that. A correction is a separate reversal payment (direction: 'debit',
 * `reversesPaymentId` set), not built by this function — see
 * docs/DECISIONS.md for what's deferred.
 *
 * On the FIRST credit payment for an enrolment, also fires Gate 2
 * (accounts -> academics, CLAUDE.md lifecycle chain): creates the `students`
 * row from the lead's profile fields (copied once, then independent —
 * "academics must never have to query the sales table") and stamps
 * `accounts_to_academics_at`/`by` on the enrolment. Runs on the direct db
 * client inside the caller's transaction, same bypass as
 * confirmAdmission()/mergeLeads()/applyAssignment() — see their doc
 * comments for why.
 */
export async function recordPayment(tx: DbExecutor, input: RecordPaymentInput): Promise<RecordPaymentResult> {
  if (input.amountPaise <= 0) {
    throw new Error("recordPayment: amount must be greater than zero");
  }

  const [enrolment] = await tx.select().from(enrolments).where(eq(enrolments.id, input.enrolmentId));
  if (!enrolment || enrolment.deletedAt) {
    throw new Error(`recordPayment: enrolment ${input.enrolmentId} not found`);
  }

  const [payment] = await tx
    .insert(payments)
    .values({
      enrolmentId: input.enrolmentId,
      amountPaise: input.amountPaise,
      direction: "credit",
      method: input.method,
      reference: input.reference ?? null,
      recordedBy: input.recordedBy,
    })
    .returning({ id: payments.id });

  const [receipt] = await tx
    .insert(receipts)
    .values({
      paymentId: payment.id,
      enrolmentId: input.enrolmentId,
      issuedBy: input.recordedBy,
    })
    .returning({ id: receipts.id, receiptNo: receipts.receiptNo });

  const priorCredits = await tx
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(eq(payments.enrolmentId, input.enrolmentId), eq(payments.direction, "credit"), isNull(payments.reversesPaymentId)),
    );
  const isFirstPayment = priorCredits.length === 1;

  if (!isFirstPayment) {
    return {
      paymentId: payment.id,
      receiptId: receipt.id,
      receiptNo: receipt.receiptNo,
      isFirstPayment: false,
      studentId: enrolment.studentId,
    };
  }

  const [lead] = await tx.select().from(leads).where(eq(leads.id, enrolment.leadId));
  if (!lead) {
    throw new Error(`recordPayment: lead ${enrolment.leadId} not found`);
  }

  const [student] = await tx
    .insert(students)
    .values({
      leadId: lead.id,
      fullName: lead.studentName,
      phone: lead.primaryPhone,
      parentPhone: lead.parentPhone,
      email: lead.email,
      dob: lead.dob,
      centerId: enrolment.centerId,
      targetExams: lead.interestedExams,
      targetExamYear: lead.examYear,
      currentCourse: enrolment.course,
    })
    .returning({ id: students.id });

  const now = new Date();
  await tx
    .update(enrolments)
    .set({
      studentId: student.id,
      status: "active",
      accountsToAcademicsAt: now,
      accountsToAcademicsBy: input.recordedBy,
    })
    .where(eq(enrolments.id, input.enrolmentId));

  return {
    paymentId: payment.id,
    receiptId: receipt.id,
    receiptNo: receipt.receiptNo,
    isFirstPayment: true,
    studentId: student.id,
  };
}
