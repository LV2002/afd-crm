"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { checkAssignment, liveMemberCount } from "@/lib/batches/roster";
import { db } from "@/lib/db/client";
import { batches, studentBatches, students } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

export interface BatchFormState {
  error?: string;
  success?: string;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function readDate(formData: FormData, key: string): string | null {
  const raw = String(formData.get(key) ?? "").trim();
  return DATE_ONLY.test(raw) ? raw : null;
}

/**
 * Creates or edits a batch.
 *
 * Runs on the direct client with the scope check re-implemented here, the
 * same pattern as every other write in this codebase that needs to read
 * across tables — `batch.manage` is centre-scoped, so a centre head may
 * only touch their own centres' batches.
 */
export async function saveBatch(_prev: BatchFormState, formData: FormData): Promise<BatchFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "batch.manage")) {
    return { error: "You don't have permission to manage batches." };
  }

  const batchId = String(formData.get("batchId") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();
  const centerId = String(formData.get("centerId") ?? "").trim();
  const course = String(formData.get("course") ?? "").trim();
  const mode = String(formData.get("mode") ?? "").trim();
  const academicYear = String(formData.get("academicYear") ?? "").trim();

  if (!name) return { error: "Give the batch a name." };
  if (!centerId) return { error: "Pick a centre." };
  if (!course) return { error: "Pick a course." };
  if (!mode) return { error: "Pick a mode." };
  if (!academicYear) return { error: "Enter the academic year." };

  // A centre head may only create batches at their own centres. `all`
  // scope (admins) passes anything.
  if (!can(user, "settings.manage") && user.centerIds.length > 0 && !user.centerIds.includes(centerId)) {
    return { error: "That centre isn't one of yours." };
  }

  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  let capacity: number | null = null;
  if (capacityRaw !== "") {
    const parsed = Number(capacityRaw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return { error: "Capacity must be a whole number of seats, or blank for no limit." };
    }
    capacity = parsed;
  }

  const startDate = readDate(formData, "startDate");
  const endDate = readDate(formData, "endDate");
  if (startDate && endDate && endDate < startDate) {
    return { error: "The batch cannot end before it starts." };
  }

  const isActive = formData.get("isActive") !== "off";

  const values = { name, centerId, course, mode, academicYear, capacity, startDate, endDate, isActive };

  let savedId: string;
  if (batchId) {
    const [existing] = await db
      .select({ id: batches.id, centerId: batches.centerId })
      .from(batches)
      .where(and(eq(batches.id, batchId), isNull(batches.deletedAt)));
    if (!existing) return { error: "That batch no longer exists." };
    if (
      !can(user, "settings.manage") &&
      user.centerIds.length > 0 &&
      !user.centerIds.includes(existing.centerId)
    ) {
      return { error: "That batch isn't at one of your centres." };
    }

    await db.update(batches).set({ ...values, updatedAt: new Date() }).where(eq(batches.id, batchId));
    savedId = batchId;
  } else {
    const [created] = await db.insert(batches).values(values).returning({ id: batches.id });
    savedId = created.id;
  }

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: batchId ? "batch.update" : "batch.create",
    entityType: "batches",
    entityId: savedId,
    after: values,
  });

  revalidatePath("/batches");
  revalidatePath(`/batches/${savedId}`);
  return { success: batchId ? "Batch saved." : `Created ${name}.` };
}

/**
 * Puts a student into a batch.
 *
 * Two writes, both needed. `student_batches` is the history — when they
 * joined, when they left, why — and `students.current_batch_id` is the
 * one the students list and the printed profile read. Keeping only the
 * history would make every roster read a join; keeping only the pointer
 * would lose the fact that somebody moved batches at all.
 */
export async function assignStudentToBatch(
  _prev: BatchFormState,
  formData: FormData,
): Promise<BatchFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "batch.manage")) {
    return { error: "You don't have permission to manage batches." };
  }

  const batchId = String(formData.get("batchId") ?? "").trim();
  const studentId = String(formData.get("studentId") ?? "").trim();
  if (!batchId || !studentId) return { error: "Pick a student." };

  const [batch] = await db
    .select()
    .from(batches)
    .where(and(eq(batches.id, batchId), isNull(batches.deletedAt)));
  if (!batch) return { error: "That batch no longer exists." };
  if (
    !can(user, "settings.manage") &&
    user.centerIds.length > 0 &&
    !user.centerIds.includes(batch.centerId)
  ) {
    return { error: "That batch isn't at one of your centres." };
  }

  const [student] = await db
    .select({ id: students.id, fullName: students.fullName, centerId: students.centerId })
    .from(students)
    .where(and(eq(students.id, studentId), isNull(students.deletedAt)));
  if (!student) return { error: "That student no longer exists." };

  const memberships = await db
    .select({ studentId: studentBatches.studentId, batchId: studentBatches.batchId, leftAt: studentBatches.leftAt })
    .from(studentBatches)
    .where(eq(studentBatches.batchId, batchId));

  const check = checkAssignment({
    studentCenterId: student.centerId,
    batch: {
      id: batch.id,
      name: batch.name,
      centerId: batch.centerId,
      centerName: null,
      course: batch.course,
      mode: batch.mode,
      academicYear: batch.academicYear,
      startDate: batch.startDate,
      endDate: batch.endDate,
      capacity: batch.capacity,
      isActive: batch.isActive,
    },
    filled: liveMemberCount(memberships, batchId),
    alreadyInBatch: memberships.some((m) => m.studentId === studentId && m.leftAt === null),
  });
  if (!check.allowed) return { error: check.error ?? "That student cannot join this batch." };

  await db.transaction(async (tx) => {
    await tx.insert(studentBatches).values({ studentId, batchId, joinedAt: new Date() });
    await tx
      .update(students)
      .set({ currentBatchId: batchId, updatedAt: new Date() })
      .where(eq(students.id, studentId));
  });

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "batch.student_added",
    entityType: "batches",
    entityId: batchId,
    after: { studentId, studentName: student.fullName, batchName: batch.name },
  });

  revalidatePath(`/batches/${batchId}`);
  revalidatePath("/batches");
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");

  return {
    success: check.warning
      ? `${student.fullName} added. ${check.warning}`
      : `${student.fullName} added to ${batch.name}.`,
  };
}

/**
 * Takes a student out of a batch.
 *
 * The membership row is closed with `left_at`, never deleted — "she was in
 * batch A until August" is the answer to a question somebody will ask
 * (CLAUDE.md § Non-negotiables 5). `current_batch_id` is cleared only if
 * it still points here; a student already moved to another batch must not
 * have that undone by tidying up an old membership.
 */
export async function removeStudentFromBatch(
  _prev: BatchFormState,
  formData: FormData,
): Promise<BatchFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "batch.manage")) {
    return { error: "You don't have permission to manage batches." };
  }

  const batchId = String(formData.get("batchId") ?? "").trim();
  const studentId = String(formData.get("studentId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!batchId || !studentId) return { error: "Missing student reference." };

  const [batch] = await db
    .select({ id: batches.id, name: batches.name, centerId: batches.centerId })
    .from(batches)
    .where(eq(batches.id, batchId));
  if (!batch) return { error: "That batch no longer exists." };
  if (
    !can(user, "settings.manage") &&
    user.centerIds.length > 0 &&
    !user.centerIds.includes(batch.centerId)
  ) {
    return { error: "That batch isn't at one of your centres." };
  }

  const now = new Date();
  const closed = await db.transaction(async (tx) => {
    const updated = await tx
      .update(studentBatches)
      .set({ leftAt: now, reason })
      .where(
        and(
          eq(studentBatches.batchId, batchId),
          eq(studentBatches.studentId, studentId),
          isNull(studentBatches.leftAt),
        ),
      )
      .returning({ id: studentBatches.id });

    if (updated.length > 0) {
      await tx
        .update(students)
        .set({ currentBatchId: null, updatedAt: now })
        .where(and(eq(students.id, studentId), eq(students.currentBatchId, batchId)));
    }
    return updated.length;
  });

  if (closed === 0) return { error: "That student is not currently in this batch." };

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "batch.student_removed",
    entityType: "batches",
    entityId: batchId,
    after: { studentId, reason, batchName: batch.name },
  });

  revalidatePath(`/batches/${batchId}`);
  revalidatePath("/batches");
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
  return { success: "Removed from the batch." };
}
