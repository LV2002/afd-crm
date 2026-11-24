import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { enrolmentInstalments, enrolments, payments } from "@/lib/db/schema";
import { effectiveDownPaymentDue } from "@/lib/enrolment/plan-status";

import { allocateWithDownPayment, DOWN_PAYMENT_ID } from "./allocate";
import type { OutstandingInstalment } from "./reminder-schedule";

/**
 * Every instalment that still has money owing, for live admissions only.
 *
 * One place, so the fee reminders and the alert to the admin about money
 * that is a month late are worked out by the same allocation the Collections
 * screen uses, and can never disagree about who is late.
 *
 * Live means past the sales-to-accounts gate, not dropped, not deleted, and
 * not an admission entered for the record from before the CRM: a dropped
 * student is not somebody to chase for money.
 */

export type LiveEnrolment = {
  id: string;
  leadId: string;
  centerId: string;
  course: string;
  studentId: string | null;
  downPaymentPaise: number;
  downPaymentDueDate: string | null;
  confirmedAt: Date | null;
};

export async function loadOutstandingInstalments(asOf: string): Promise<{
  liveEnrolments: LiveEnrolment[];
  outstanding: OutstandingInstalment[];
  enrolmentByInstalment: Map<string, LiveEnrolment>;
}> {
  const liveEnrolments = await db
    .select({
      id: enrolments.id,
      leadId: enrolments.leadId,
      centerId: enrolments.centerId,
      course: enrolments.course,
      studentId: enrolments.studentId,
      downPaymentPaise: enrolments.downPaymentPaise,
      downPaymentDueDate: enrolments.downPaymentDueDate,
      confirmedAt: enrolments.salesToAccountsAt,
    })
    .from(enrolments)
    .where(and(isNull(enrolments.deletedAt), isNull(enrolments.droppedAt), eq(enrolments.isHistorical, false)));

  const outstanding: OutstandingInstalment[] = [];
  const enrolmentByInstalment = new Map<string, LiveEnrolment>();
  if (liveEnrolments.length === 0) return { liveEnrolments, outstanding, enrolmentByInstalment };

  const enrolmentIds = liveEnrolments.map((row) => row.id);
  const [instalmentRows, paymentRows] = await Promise.all([
    db.select().from(enrolmentInstalments).where(inArray(enrolmentInstalments.enrolmentId, enrolmentIds)),
    db
      .select({
        id: payments.id,
        enrolmentId: payments.enrolmentId,
        amountPaise: payments.amountPaise,
        direction: payments.direction,
        receivedAt: payments.receivedAt,
      })
      .from(payments)
      .where(inArray(payments.enrolmentId, enrolmentIds)),
  ]);

  for (const enrolment of liveEnrolments) {
    const schedule = instalmentRows
      .filter((row) => row.enrolmentId === enrolment.id)
      .map((row) => ({ id: row.id, sequence: row.sequence, dueDate: row.dueDate, amountPaise: row.amountPaise }));
    if (schedule.length === 0 && enrolment.downPaymentPaise === 0) continue;

    const received = paymentRows
      .filter((row) => row.enrolmentId === enrolment.id)
      .map((row) => ({
        id: row.id,
        // A debit is a reversal or refund: it puts the money back on the
        // schedule, so somebody whose payment bounced becomes overdue again.
        amountPaise: row.direction === "credit" ? row.amountPaise : -row.amountPaise,
        receivedOn: row.receivedAt.toISOString().slice(0, 10),
      }));

    // The down payment is laid out first so the first money in settles it
    // rather than instalment 1, then left out: an alert is keyed to a real
    // instalment row.
    const allocated = allocateWithDownPayment(
      schedule,
      enrolment.downPaymentPaise,
      effectiveDownPaymentDue(enrolment.downPaymentDueDate, enrolment.confirmedAt, asOf),
      received,
      asOf,
    );
    for (const settled of allocated.instalments) {
      if (settled.id === DOWN_PAYMENT_ID) continue;
      if (settled.outstandingPaise <= 0) continue;
      outstanding.push({
        instalmentId: settled.id,
        enrolmentId: enrolment.id,
        dueDate: settled.dueDate,
        outstandingPaise: settled.outstandingPaise,
      });
      enrolmentByInstalment.set(settled.id, enrolment);
    }
  }
  return { liveEnrolments, outstanding, enrolmentByInstalment };
}
