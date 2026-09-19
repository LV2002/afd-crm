"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Writing the syllabus down.
 *
 * Every write here goes through the RLS-bound client, so the policy on
 * each table is the real gate and the `can()` check below is the courtesy
 * that turns a silent no-op into a sentence a person can read. Nothing in
 * this file uses the direct db client, and nothing should: there is no
 * identity resolution here, just ordinary rows.
 *
 * Nothing is ever hard-deleted (CLAUDE.md non-negotiable #5). "Remove"
 * sets `deleted_at`, which keeps last year's plan readable after this
 * year's has been rewritten over the top of it.
 */

export interface SyllabusFormState {
  error?: string;
  success?: string;
}

const DENIED: SyllabusFormState = {
  error: "You don't have permission to edit the syllabus.",
};

/** Both halves of the gate: the permission, and the org-wide scope the RLS policy demands. */
async function requireEditor() {
  const user = await getCurrentUser();
  if (!user || !can(user, "curriculum.manage")) return null;
  return user;
}

const moduleSchema = z.object({
  name: z.string().trim().min(1, "Give the module a name."),
  subject: z.string().trim().optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export async function saveModule(
  _prev: SyllabusFormState,
  formData: FormData,
): Promise<SyllabusFormState> {
  const user = await requireEditor();
  if (!user) return DENIED;

  const id = (formData.get("id") as string) || null;
  const parsed = moduleSchema.safeParse({
    name: formData.get("name"),
    subject: formData.get("subject"),
    description: formData.get("description"),
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const supabase = await createClient();
  const values = {
    name: parsed.data.name,
    subject: parsed.data.subject || null,
    description: parsed.data.description || null,
    sort_order: parsed.data.sortOrder,
  };

  const { error } = id
    ? await supabase.from("syllabus_modules").update(values).eq("id", id)
    : await supabase.from("syllabus_modules").insert(values);

  if (error) return { error: error.message };

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: id ? "curriculum.module_updated" : "curriculum.module_created",
    entityType: "syllabus_modules",
    entityId: id,
    after: values,
  });

  revalidatePath("/academics/syllabus");
  return { success: id ? "Module updated." : `Added "${parsed.data.name}".` };
}

const topicSchema = z.object({
  moduleId: z.string().uuid("Pick a module."),
  name: z.string().trim().min(1, "Give the topic a name."),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export async function saveTopic(
  _prev: SyllabusFormState,
  formData: FormData,
): Promise<SyllabusFormState> {
  const user = await requireEditor();
  if (!user) return DENIED;

  const id = (formData.get("id") as string) || null;
  const parsed = topicSchema.safeParse({
    moduleId: formData.get("moduleId"),
    name: formData.get("name"),
    description: formData.get("description"),
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const supabase = await createClient();
  const values = {
    module_id: parsed.data.moduleId,
    name: parsed.data.name,
    description: parsed.data.description || null,
    sort_order: parsed.data.sortOrder,
  };

  const { error } = id
    ? await supabase.from("syllabus_topics").update(values).eq("id", id)
    : await supabase.from("syllabus_topics").insert(values);

  if (error) return { error: error.message };

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: id ? "curriculum.topic_updated" : "curriculum.topic_created",
    entityType: "syllabus_topics",
    entityId: id,
    after: values,
  });

  revalidatePath("/academics/syllabus");
  return { success: id ? "Topic updated." : `Added "${parsed.data.name}".` };
}

const ARCHIVABLE = {
  module: "syllabus_modules",
  topic: "syllabus_topics",
  item: "curriculum_items",
} as const;

/**
 * Remove something from the syllabus without destroying it.
 *
 * A module archived in October must still explain what a class in
 * September was about, so this is a soft delete — and the `kind` is
 * checked against a fixed map rather than interpolated, so a tampered
 * form cannot name a table this action was never meant to touch.
 */
export async function archiveSyllabusRow(
  kind: keyof typeof ARCHIVABLE,
  id: string,
): Promise<SyllabusFormState> {
  const user = await requireEditor();
  if (!user) return DENIED;

  const table = ARCHIVABLE[kind];
  if (!table) return { error: "Nothing to remove." };

  const supabase = await createClient();
  const { error } = await supabase
    .from(table)
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", id);

  if (error) return { error: error.message };

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "curriculum.archived",
    entityType: table,
    entityId: id,
  });

  revalidatePath("/academics/syllabus");
  return { success: "Removed." };
}

const curriculumSchema = z.object({
  course: z.string().trim().min(1, "Pick a course."),
  academicYear: z.string().trim().max(20).optional().or(z.literal("")),
  teachingEndDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-15")
    .optional()
    .or(z.literal("")),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
});

export async function saveCurriculum(
  _prev: SyllabusFormState,
  formData: FormData,
): Promise<SyllabusFormState> {
  const user = await requireEditor();
  if (!user) return DENIED;

  const id = (formData.get("id") as string) || null;
  const parsed = curriculumSchema.safeParse({
    course: formData.get("course"),
    academicYear: formData.get("academicYear"),
    teachingEndDate: formData.get("teachingEndDate"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const supabase = await createClient();
  const values = {
    course: parsed.data.course,
    academic_year: parsed.data.academicYear || null,
    teaching_end_date: parsed.data.teachingEndDate || null,
    notes: parsed.data.notes || null,
  };

  const { error } = id
    ? await supabase.from("course_curricula").update(values).eq("id", id)
    : await supabase.from("course_curricula").insert(values);

  if (error) {
    // The partial unique indexes are the only way two plans for one course
    // can collide, and the raw message names an index rather than a cause.
    if (error.code === "23505") {
      return { error: `There is already a plan for ${parsed.data.course} in that year.` };
    }
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: id ? "curriculum.plan_updated" : "curriculum.plan_created",
    entityType: "course_curricula",
    entityId: id,
    after: values,
  });

  revalidatePath("/academics/syllabus");
  return { success: id ? "Plan updated." : `Started a plan for ${parsed.data.course}.` };
}

const itemSchema = z.object({
  curriculumId: z.string().uuid(),
  moduleId: z.string().uuid("Pick a module."),
  topicId: z.string().uuid().optional().or(z.literal("")),
  kind: z.enum(["teaching", "practice", "mock_test", "revision"]),
  // Quarter hours, because that is how teaching is actually divided. The
  // upper bound matches the database check so the two cannot disagree.
  hours: z.coerce
    .number()
    .min(0, "Hours cannot be negative.")
    .max(100, "That is more than 100 hours — check the number."),
  coverage: z.string().trim().max(4000).optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export async function saveCurriculumItem(
  _prev: SyllabusFormState,
  formData: FormData,
): Promise<SyllabusFormState> {
  const user = await requireEditor();
  if (!user) return DENIED;

  const id = (formData.get("id") as string) || null;
  const parsed = itemSchema.safeParse({
    curriculumId: formData.get("curriculumId"),
    moduleId: formData.get("moduleId"),
    topicId: formData.get("topicId"),
    kind: formData.get("kind"),
    hours: formData.get("hours") || 0,
    coverage: formData.get("coverage"),
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const supabase = await createClient();
  const values = {
    curriculum_id: parsed.data.curriculumId,
    module_id: parsed.data.moduleId,
    topic_id: parsed.data.topicId || null,
    kind: parsed.data.kind,
    hours: parsed.data.hours.toFixed(2),
    coverage: parsed.data.coverage || null,
    sort_order: parsed.data.sortOrder,
  };

  const { error } = id
    ? await supabase.from("curriculum_items").update(values).eq("id", id)
    : await supabase.from("curriculum_items").insert(values);

  if (error) return { error: error.message };

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: id ? "curriculum.block_updated" : "curriculum.block_added",
    entityType: "curriculum_items",
    entityId: id,
    after: values,
  });

  revalidatePath("/academics/syllabus");
  return { success: id ? "Saved." : "Block added." };
}

/**
 * Copy every block from one course's plan into another.
 *
 * The coordinator's real workflow: Foundation is the full plan, and Crash
 * is Foundation with the hours cut. Retyping sixty rows to make that
 * change is how a plan ends up half-finished, so the plans are created by
 * copying and then edited down.
 *
 * Coverage notes come across too — they are the part worth keeping, and
 * the part it is most painful to retype.
 */
export async function copyCurriculum(
  fromCurriculumId: string,
  toCurriculumId: string,
): Promise<SyllabusFormState> {
  const user = await requireEditor();
  if (!user) return DENIED;
  if (fromCurriculumId === toCurriculumId) {
    return { error: "Pick a different plan to copy from." };
  }

  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("curriculum_items")
    .select("id")
    .eq("curriculum_id", toCurriculumId)
    .is("deleted_at", null)
    .limit(1);
  if (existingError) return { error: existingError.message };
  if (existing && existing.length > 0) {
    // Refusing rather than merging: a copy into a plan that already has
    // blocks produces silent duplicates, and the coordinator would not
    // see them until the timetable scheduled the same topic twice.
    return { error: "That plan already has blocks in it. Copy only into an empty plan." };
  }

  const { data: source, error: sourceError } = await supabase
    .from("curriculum_items")
    .select("module_id, topic_id, kind, hours, coverage, sort_order")
    .eq("curriculum_id", fromCurriculumId)
    .is("deleted_at", null)
    .order("sort_order");
  if (sourceError) return { error: sourceError.message };
  if (!source || source.length === 0) return { error: "That plan has nothing to copy." };

  const { error } = await supabase
    .from("curriculum_items")
    .insert(source.map((row) => ({ ...row, curriculum_id: toCurriculumId })));
  if (error) return { error: error.message };

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "curriculum.plan_copied",
    entityType: "course_curricula",
    entityId: toCurriculumId,
    after: { fromCurriculumId, blocks: source.length },
  });

  revalidatePath("/academics/syllabus");
  return { success: `Copied ${source.length} blocks. Now adjust the hours.` };
}
