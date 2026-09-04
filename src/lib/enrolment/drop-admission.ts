import { eq } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { enrolments, students } from "@/lib/db/schema";

/**
 * A student left the course.
 *
 * Not a gate and not a deletion. Both gates are one-way handoffs between
 * departments; a drop is a fact about the student that all three
 * departments need to see, and that can turn out to have been recorded
 * against the wrong person — so it is reversible, and every change is
 * audited by the calling action.
 *
 * Runs on the direct db client inside the caller's transaction, the same
 * bypass as confirmAdmission() and recordPayment(): it writes across
 * `enrolments` and `students` atomically, and the person recording a drop
 * is usually accounts, who hold `enrolment.drop` but not `student.update`.
 * Splitting the write across two clients to satisfy RLS would mean an
 * admission that is dropped while the student record still says active —
 * exactly the disagreement this transaction exists to prevent. The
 * calling Server Action re-implements the own/center/all scope check
 * before ever calling this (see dropAdmissionAction in
 * accounts/[id]/actions.ts).
 *
 * What it deliberately does NOT touch:
 *
 * - `payments`. Append-only, and a fee that was collected was collected.
 *   A refund is its own reversal entry, decided by whoever handles the
 *   money, not implied by the student walking out.
 * - `leads`. The sales record stops changing at the first gate
 *   (CLAUDE.md), and the drop is displayed there by reading the
 *   enrolment, not by rewriting history to say the admission never
 *   happened.
 */

export interface DropAdmissionInput {
  enrolmentId: string;
  reason: string;
  droppedBy: string | null;
  /** Defaults to now; injectable so tests don't depend on the clock. */
  at?: Date;
}

export interface DropAdmissionResult {
  leadId: string;
  centerId: string;
  studentId: string | null;
  course: string;
}

export async function dropAdmission(
  tx: DbExecutor,
  input: DropAdmissionInput,
): Promise<DropAdmissionResult> {
  const reason = input.reason.trim();
  if (!reason) {
    throw new Error("dropAdmission: a reason is required");
  }

  const [enrolment] = await tx
    .select()
    .from(enrolments)
    .where(eq(enrolments.id, input.enrolmentId));

  if (!enrolment || enrolment.deletedAt) {
    throw new Error("dropAdmission: this admission no longer exists");
  }
  if (enrolment.droppedAt) {
    throw new Error("dropAdmission: this admission is already marked dropped");
  }

  await tx
    .update(enrolments)
    .set({
      droppedAt: input.at ?? new Date(),
      droppedBy: input.droppedBy,
      dropReason: reason,
    })
    .where(eq(enrolments.id, input.enrolmentId));

  // Academics read `students` and never the sales or commercial tables
  // (CLAUDE.md), so unless this lands there they carry on marking a
  // register for somebody who left.
  if (enrolment.studentId) {
    await tx
      .update(students)
      .set({ status: "dropped" })
      .where(eq(students.id, enrolment.studentId));
  }

  return {
    leadId: enrolment.leadId,
    centerId: enrolment.centerId,
    studentId: enrolment.studentId,
    course: enrolment.course,
  };
}

/**
 * Undoes a drop recorded against the wrong admission.
 *
 * The student comes back as `active` rather than to whatever they were
 * before. A drop is not meant to be a way to park somebody — `on_hold`
 * already exists for that — so remembering the prior status would be
 * storing a column to serve a workflow the system deliberately doesn't
 * have. Academics can set it back to on-hold in one click if that is
 * genuinely where they were.
 */
export async function restoreAdmission(
  tx: DbExecutor,
  input: { enrolmentId: string },
): Promise<DropAdmissionResult> {
  const [enrolment] = await tx
    .select()
    .from(enrolments)
    .where(eq(enrolments.id, input.enrolmentId));

  if (!enrolment || enrolment.deletedAt) {
    throw new Error("restoreAdmission: this admission no longer exists");
  }
  if (!enrolment.droppedAt) {
    throw new Error("restoreAdmission: this admission is not marked dropped");
  }

  await tx
    .update(enrolments)
    .set({ droppedAt: null, droppedBy: null, dropReason: null })
    .where(eq(enrolments.id, input.enrolmentId));

  if (enrolment.studentId) {
    await tx
      .update(students)
      .set({ status: "active" })
      .where(eq(students.id, enrolment.studentId));
  }

  return {
    leadId: enrolment.leadId,
    centerId: enrolment.centerId,
    studentId: enrolment.studentId,
    course: enrolment.course,
  };
}
