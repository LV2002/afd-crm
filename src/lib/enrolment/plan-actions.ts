"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import {
  batches,
  dropdownOptions,
  enrolments,
  leads,
  studentBatches,
  students,
} from "@/lib/db/schema";
import { notify } from "@/lib/notifications/notify";
import { createClient } from "@/lib/supabase/server";

import { describeChanges, planChanges, type PlanLabels, type PlanSnapshot } from "./plan-change";

export interface PlanFormState {
  error?: string;
  success?: string;
}

/**
 * Moves a confirmed admission onto a different course, batch, mode or
 * academic year.
 *
 * ## Why this exists at all
 *
 * The enrolment was written once, at Gate 1, and then nothing could touch
 * it. In practice a student's course changes more often than almost
 * anything else in this business: they enquire about Foundation, sit the
 * counselling and join DWO; the Tuesday batch fills and they move to
 * Thursday; an offline student goes online after moving city. Before
 * this, every one of those was either a wrong record left standing or a
 * second enrolment nobody could reconcile.
 *
 * ## Why it does not touch the fee
 *
 * Changing the course does NOT re-price the admission, even though a
 * different course usually has a different fee structure. Re-pricing
 * silently would move what a family owes without anybody agreeing it —
 * which is a discount, or a surcharge, arriving through the back door and
 * bypassing the approval limits that exist precisely to stop that. So the
 * fee stays exactly as agreed and accounts are told the course moved;
 * they change the figure deliberately, on the fee panel, if it should
 * change. See docs/DECISIONS.md.
 *
 * ## Why it writes four tables
 *
 * `enrolments` is the commercial record, `students.current_course` and
 * `students.current_batch_id` are what the academics screens read, and
 * `student_batches` is the history of who was in which room when. Writing
 * one and not the others is how a system ends up with three answers to
 * "what is this student studying"; they move together in a transaction or
 * not at all.
 */
export async function changeEnrolmentPlan(
  _prev: PlanFormState,
  formData: FormData,
): Promise<PlanFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "enrolment.change_plan")) {
    return { error: "You don't have permission to change a course or batch." };
  }

  const enrolmentId = String(formData.get("enrolmentId") ?? "").trim();
  if (!enrolmentId) return { error: "Missing enrolment reference." };

  const [row] = await db
    .select({
      id: enrolments.id,
      leadId: enrolments.leadId,
      studentId: enrolments.studentId,
      centerId: enrolments.centerId,
      course: enrolments.course,
      batchId: enrolments.batchId,
      mode: enrolments.mode,
      academicYear: enrolments.academicYear,
      droppedAt: enrolments.droppedAt,
      leadName: leads.studentName,
      leadCenterId: leads.centerId,
      assignedTo: leads.assignedTo,
    })
    .from(enrolments)
    .innerJoin(leads, eq(leads.id, enrolments.leadId))
    .where(and(eq(enrolments.id, enrolmentId), isNull(enrolments.deletedAt)));

  if (!row) return { error: "That admission no longer exists." };

  // The direct db client bypasses RLS, so the scope check the policy would
  // have made is re-implemented here — the same pattern as saveFeePlan and
  // confirmAdmissionAction, and for the same reason: this write spans
  // four tables and has to be one transaction.
  const scope = scopeFor(user, "enrolment.change_plan");
  if (scope === "own" && row.assignedTo !== user.id) {
    return { error: "That student isn't one of yours." };
  }
  if (scope === "center" && (!row.leadCenterId || !user.centerIds.includes(row.leadCenterId))) {
    return { error: "That student isn't at your centre." };
  }

  if (row.droppedAt) {
    return {
      error: "This student has dropped. Restore the admission first if they are coming back.",
    };
  }

  const course = String(formData.get("course") ?? "").trim();
  const mode = String(formData.get("mode") ?? "").trim();
  const academicYear = String(formData.get("academicYear") ?? "").trim();
  const batchIdRaw = String(formData.get("batchId") ?? "").trim();
  const batchId = batchIdRaw === "" ? null : batchIdRaw;
  const reason = String(formData.get("reason") ?? "").trim();

  if (!course) return { error: "Pick a course." };
  if (!mode) return { error: "Pick a mode." };
  if (!academicYear) return { error: "Pick an academic year." };

  // A batch at another centre is a mis-click every time — the same rule
  // the roster already enforces when academics add somebody to a batch
  // from Settings → Batches.
  let batchName: string | null = null;
  if (batchId) {
    const [batch] = await db
      .select({
        id: batches.id,
        name: batches.name,
        centerId: batches.centerId,
        isActive: batches.isActive,
      })
      .from(batches)
      .where(and(eq(batches.id, batchId), isNull(batches.deletedAt)));

    if (!batch) return { error: "That batch no longer exists." };
    if (batch.centerId !== row.centerId) {
      return { error: "That batch runs at a different centre from this student's." };
    }
    if (!batch.isActive) {
      return { error: "That batch is no longer running. Reactivate it first, or pick another." };
    }
    batchName = batch.name;
  }

  const before: PlanSnapshot = {
    course: row.course,
    batchId: row.batchId,
    mode: row.mode,
    academicYear: row.academicYear,
  };
  const after: PlanSnapshot = { course, batchId, mode, academicYear };

  const labels = await planLabels(before, after, batchName);
  const changes = planChanges(before, after, labels);

  // Pressing Save on a form nobody edited should not write an audit row
  // and tell three departments that a course changed to itself.
  if (changes.length === 0) {
    return { success: "Nothing to change — those are the current details." };
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(enrolments)
      .set({ course, batchId, mode, academicYear, updatedAt: now })
      .where(eq(enrolments.id, enrolmentId));

    if (row.studentId) {
      await tx
        .update(students)
        .set({ currentCourse: course, currentBatchId: batchId, updatedAt: now })
        .where(eq(students.id, row.studentId));

      // The roster history, only when the batch itself moved. Closing and
      // reopening a membership on a course-only change would invent a
      // batch move that never happened, and the batch screen reads this
      // table to say who was in the room on a given day.
      if (before.batchId !== batchId) {
        if (before.batchId) {
          await tx
            .update(studentBatches)
            .set({ leftAt: now, reason: reason || "Moved batch" })
            .where(
              and(
                eq(studentBatches.studentId, row.studentId),
                eq(studentBatches.batchId, before.batchId),
                isNull(studentBatches.leftAt),
              ),
            );
        }
        if (batchId) {
          await tx
            .insert(studentBatches)
            .values({ studentId: row.studentId, batchId, joinedAt: now, reason: reason || null });
        }
      }
    }
  });

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "enrolment.change_plan",
    entityType: "enrolments",
    entityId: enrolmentId,
    before,
    after: { ...after, reason: reason || null },
  });

  await notify({
    eventKey: "enrolment.plan_changed",
    context: {
      student_name: row.leadName,
      changes: describeChanges(changes),
      changed_by: user.fullName ?? user.email,
      course: labels.course(course),
      // Not a template variable the event advertises, but harmless in the
      // stored context and useful to anybody reading the row later.
      reason: reason || null,
    },
    href: `/leads/${row.leadId}`,
    entityType: "enrolments",
    entityId: enrolmentId,
    centerId: row.centerId,
    ownerId: row.assignedTo,
    actorId: user.id,
  });

  revalidatePath(`/leads/${row.leadId}`);
  revalidatePath(`/accounts/${enrolmentId}`);
  revalidatePath("/accounts");
  if (row.studentId) {
    revalidatePath(`/students/${row.studentId}`);
    revalidatePath("/students");
  }

  return { success: describeChanges(changes) };
}

/**
 * Display names for the codes involved, read once for both snapshots.
 *
 * Courses and modes are `dropdown_options`, so a renamed option shows its
 * new name; a value whose option an admin has since deleted falls back to
 * the raw value rather than disappearing.
 */
async function planLabels(
  before: PlanSnapshot,
  after: PlanSnapshot,
  newBatchName: string | null,
): Promise<PlanLabels> {
  const rows = await db
    .select({
      category: dropdownOptions.category,
      value: dropdownOptions.value,
      label: dropdownOptions.label,
    })
    .from(dropdownOptions)
    .where(
      and(
        inArray(dropdownOptions.category, ["course", "preferred_mode"]),
        isNull(dropdownOptions.deletedAt),
      ),
    );

  const byCategory = new Map<string, Map<string, string>>();
  for (const row of rows) {
    const map = byCategory.get(row.category) ?? new Map<string, string>();
    map.set(row.value, row.label);
    byCategory.set(row.category, map);
  }

  const batchNames = new Map<string, string>();
  if (newBatchName && after.batchId) batchNames.set(after.batchId, newBatchName);
  if (before.batchId && !batchNames.has(before.batchId)) {
    const [old] = await db
      .select({ name: batches.name })
      .from(batches)
      .where(eq(batches.id, before.batchId));
    if (old) batchNames.set(before.batchId, old.name);
  }

  return {
    course: (value) => byCategory.get("course")?.get(value) ?? value,
    mode: (value) => byCategory.get("preferred_mode")?.get(value) ?? value,
    batch: (id) => (id === null ? "No batch" : (batchNames.get(id) ?? "a batch")),
  };
}
