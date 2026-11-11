import { eq } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { enrolments, leads, studentBatches, students } from "@/lib/db/schema";

/**
 * Gate 2 (accounts -> academics): the student record for an admission.
 *
 * Normally reached through the first cleared payment (`recordPayment()`). It
 * stands alone so that an admission imported from before the CRM can be made
 * a student when it is imported, with no payment to trigger it. The profile
 * fields are copied from the lead once and are independent afterwards —
 * academics never has to read the sales table.
 *
 * Runs on the direct db client inside the caller's transaction, the same
 * bypass as confirmAdmission() and recordPayment(); both callers have
 * already checked who is acting.
 */
export async function createStudentFromEnrolment(
  tx: DbExecutor,
  input: {
    enrolmentId: string;
    recordedBy: string | null;
    /** The day they actually joined. Defaults to now. */
    joinedAt?: Date;
    /** Skip the onboarding queue: they joined long ago and are already settled. */
    onboarded?: boolean;
  },
): Promise<{ studentId: string }> {
  const [enrolment] = await tx.select().from(enrolments).where(eq(enrolments.id, input.enrolmentId));
  if (!enrolment || enrolment.deletedAt) throw new Error("createStudentFromEnrolment: this admission no longer exists");
  if (enrolment.studentId) return { studentId: enrolment.studentId };

  const [lead] = await tx.select().from(leads).where(eq(leads.id, enrolment.leadId));
  if (!lead) throw new Error(`createStudentFromEnrolment: lead ${enrolment.leadId} not found`);

  const now = input.joinedAt ?? new Date();

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
      intakeYear: enrolment.academicYear,
      // The batch the counsellor picked at Gate 1, carried across rather
      // than left for somebody to fill in afterwards.
      currentBatchId: enrolment.batchId,
      joinedAt: now,
      // Somebody who joined years ago is not waiting to be onboarded.
      ...(input.onboarded ? { onboardedAt: now } : {}),
    })
    .returning({ id: students.id });

  // The roster row as well as the pointer on the student. `current_batch_id`
  // answers "which batch are they in now"; `student_batches` is the history.
  if (enrolment.batchId) {
    await tx.insert(studentBatches).values({ studentId: student.id, batchId: enrolment.batchId, joinedAt: now });
  }
  await tx
    .update(enrolments)
    .set({
      studentId: student.id,
      status: "active",
      accountsToAcademicsAt: now,
      accountsToAcademicsBy: input.recordedBy,
    })
    .where(eq(enrolments.id, input.enrolmentId));

  return { studentId: student.id };
}
