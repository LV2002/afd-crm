"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { activeDropdownValues } from "@/lib/config/dropdown-values";
import { db } from "@/lib/db/client";
import { batches, dropdownOptions } from "@/lib/db/schema";
import { OPTION_VALUE_PATTERN, slugifyValue } from "@/lib/dropdowns/option-helpers";
import { COURSE_MODE_KEY } from "@/lib/enrolment/course-catalog";
import { createClient } from "@/lib/supabase/server";

export interface CourseFormState {
  error?: string;
  success?: string;
}

/**
 * Adds a course, or renames one / changes its mode.
 *
 * A course is a row in the `course` dropdown (so everything that already
 * lists courses keeps working) with its mode in the row's metadata. The mode
 * must be one of the live modes in `preferred_mode`, read from the database
 * rather than named here.
 *
 * Changing a course's mode moves its batches with it: a batch's mode IS its
 * course's mode, and leaving them to disagree would be the very "which mode
 * is this, really" confusion this screen exists to remove. Students already
 * enrolled keep the mode they were taken with — that is history.
 */
export async function saveCourse(_prev: CourseFormState, formData: FormData): Promise<CourseFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const existingValue = String(formData.get("courseValue") ?? "").trim() || null;
  const label = String(formData.get("name") ?? "").trim();
  const mode = String(formData.get("mode") ?? "").trim();

  if (!label) return { error: "Give the course a name." };
  const modes = await activeDropdownValues("preferred_mode");
  if (!mode || !modes.includes(mode)) {
    return { error: "Pick the course's mode." };
  }

  const supabase = await createClient();

  if (existingValue) {
    const [row] = await db
      .select({ id: dropdownOptions.id, metadata: dropdownOptions.metadata })
      .from(dropdownOptions)
      .where(
        and(
          eq(dropdownOptions.category, "course"),
          eq(dropdownOptions.value, existingValue),
          isNull(dropdownOptions.deletedAt),
        ),
      );
    if (!row) return { error: "That course no longer exists." };

    const previousMode = typeof row.metadata?.[COURSE_MODE_KEY] === "string" ? String(row.metadata[COURSE_MODE_KEY]) : null;

    await db.transaction(async (tx) => {
      await tx
        .update(dropdownOptions)
        .set({ label, metadata: { ...(row.metadata ?? {}), [COURSE_MODE_KEY]: mode }, updatedAt: new Date() })
        .where(eq(dropdownOptions.id, row.id));
      if (previousMode !== mode) {
        await tx
          .update(batches)
          .set({ mode, updatedAt: new Date() })
          .where(and(eq(batches.course, existingValue), isNull(batches.deletedAt)));
      }
    });

    await writeAuditLog(supabase, {
      actorId: user.id,
      action: "course.update",
      entityType: "dropdown_options",
      entityId: row.id,
      before: { mode: previousMode },
      after: { label, mode },
    });
    revalidatePath("/settings/courses");
    return {
      success:
        previousMode !== null && previousMode !== mode
          ? `Saved ${label}. Its batches are now ${mode} too.`
          : `Saved ${label}.`,
    };
  }

  // A new course. The value is made from the name, the same as everywhere a
  // dropdown option is added.
  const value = slugifyValue(label);
  if (!OPTION_VALUE_PATTERN.test(value)) {
    return { error: "Use a name with letters in it — it becomes the course's internal code." };
  }

  // The value may already be there — alive, or removed. A removed one is
  // brought back with the new details rather than colliding with itself.
  const [clash] = await db
    .select({
      id: dropdownOptions.id,
      label: dropdownOptions.label,
      deletedAt: dropdownOptions.deletedAt,
      metadata: dropdownOptions.metadata,
    })
    .from(dropdownOptions)
    .where(and(eq(dropdownOptions.category, "course"), eq(dropdownOptions.value, value)));

  if (clash && !clash.deletedAt) {
    return { error: `There is already a course called "${clash.label}". Edit that one instead.` };
  }

  if (clash) {
    await db
      .update(dropdownOptions)
      .set({
        label,
        isActive: true,
        deletedAt: null,
        metadata: { ...(clash.metadata ?? {}), [COURSE_MODE_KEY]: mode },
        updatedAt: new Date(),
      })
      .where(eq(dropdownOptions.id, clash.id));
  } else {
    const [{ next }] = await db
      .select({ next: sql<number>`coalesce(max(${dropdownOptions.sortOrder}), -1) + 1` })
      .from(dropdownOptions)
      .where(eq(dropdownOptions.category, "course"));
    await db.insert(dropdownOptions).values({
      category: "course",
      value,
      label,
      sortOrder: Number(next),
      metadata: { [COURSE_MODE_KEY]: mode },
    });
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "course.create",
    entityType: "dropdown_options",
    after: { value, label, mode, revived: Boolean(clash) },
  });
  revalidatePath("/settings/courses");
  return { success: clash ? `Brought back ${label}.` : `Added ${label}. Now add its batches below.` };
}

/** Switches a course off (or on) without deleting it, so records that name it still read. */
export async function setCourseActive(courseValue: string, isActive: boolean): Promise<CourseFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const [row] = await db
    .select({ id: dropdownOptions.id, label: dropdownOptions.label })
    .from(dropdownOptions)
    .where(
      and(
        eq(dropdownOptions.category, "course"),
        eq(dropdownOptions.value, courseValue),
        isNull(dropdownOptions.deletedAt),
      ),
    );
  if (!row) return { error: "That course no longer exists." };

  await db
    .update(dropdownOptions)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(dropdownOptions.id, row.id));

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "course.update",
    entityType: "dropdown_options",
    entityId: row.id,
    after: { isActive },
  });
  revalidatePath("/settings/courses");
  return { success: isActive ? `${row.label} is on again.` : `${row.label} is off. Its batches and past students are untouched.` };
}
