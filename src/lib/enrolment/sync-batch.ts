import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { batches, enrolments, leads } from "@/lib/db/schema";

export interface SyncedEnrolment {
  enrolmentId: string;
  leadId: string;
  centerId: string;
  /** The lead's counsellor, so the person who sold it can be told. */
  assignedTo: string | null;
  studentName: string;
  course: string;
  previousBatchId: string | null;
  /** The batch's own name, so a notification can say it rather than an id. */
  previousBatchName: string | null;
}

/**
 * Points a student's live enrolment at the batch they are actually in.
 *
 * Settings → Batches has always written `student_batches` (the history)
 * and `students.current_batch_id` (the pointer the roster reads) — but
 * not `enrolments.batch_id`, which is what the admission record, the
 * printed agreement and the accounts screens read. So a student moved
 * between class groups ended up with two batches on file, and which one
 * you saw depended on which screen you opened.
 *
 * Returns the enrolments that actually moved, so the caller can say so
 * out loud; an empty array means there was nothing to correct, which is
 * the normal case for a student with no live enrolment.
 *
 * Dropped and deleted enrolments are left alone: a finished record should
 * keep saying which batch they were in when they left.
 */
export async function syncEnrolmentBatch(
  tx: DbExecutor,
  studentId: string,
  batchId: string | null,
): Promise<SyncedEnrolment[]> {
  const rows = await tx
    .select({
      enrolmentId: enrolments.id,
      leadId: enrolments.leadId,
      centerId: enrolments.centerId,
      assignedTo: leads.assignedTo,
      studentName: leads.studentName,
      course: enrolments.course,
      previousBatchId: enrolments.batchId,
      previousBatchName: batches.name,
    })
    .from(enrolments)
    .innerJoin(leads, eq(leads.id, enrolments.leadId))
    .leftJoin(batches, eq(batches.id, enrolments.batchId))
    .where(
      and(
        eq(enrolments.studentId, studentId),
        isNull(enrolments.deletedAt),
        isNull(enrolments.droppedAt),
      ),
    );

  const moved = rows.filter((row) => row.previousBatchId !== batchId);
  for (const row of moved) {
    await tx
      .update(enrolments)
      .set({ batchId, updatedAt: new Date() })
      .where(eq(enrolments.id, row.enrolmentId));
  }

  return moved;
}
