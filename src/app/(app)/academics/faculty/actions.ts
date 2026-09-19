"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { normalizePhone } from "@/lib/identity/normalize-phone";
import { createClient } from "@/lib/supabase/server";

/**
 * Adding and changing teaching staff.
 *
 * Built for the way AFD actually staffs: a visiting faculty member is
 * confirmed on Thursday for Saturday's class. So the only required field
 * is a name. Subjects, centres, hours and a login can all follow, or never
 * come at all for somebody who teaches one module and leaves.
 *
 * Every write goes through the RLS-bound client. The `can()` checks turn
 * a policy's silent no-op into a sentence, they are not the enforcement.
 */

export interface FacultyFormState {
  error?: string;
  success?: string;
  /** The row just created, so the page can open its editor straight away. */
  facultyId?: string;
}

const DENIED: FacultyFormState = { error: "You don't have permission to manage faculty." };

async function requireManager() {
  const user = await getCurrentUser();
  if (!user || !can(user, "faculty.manage")) return null;
  return user;
}

const facultySchema = z.object({
  fullName: z.string().trim().min(1, "Give them a name."),
  phone: z.string().trim().optional().or(z.literal("")),
  email: z.string().trim().email("That is not an email address.").optional().or(z.literal("")),
  employmentType: z.string().trim().optional().or(z.literal("")),
  availabilityMode: z.enum(["always", "by_window"]),
  profileId: z.string().uuid().optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  isActive: z.coerce.boolean(),
});

export async function saveFaculty(
  _prev: FacultyFormState,
  formData: FormData,
): Promise<FacultyFormState> {
  const user = await requireManager();
  if (!user) return DENIED;

  const id = (formData.get("id") as string) || null;
  const parsed = facultySchema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    employmentType: formData.get("employmentType"),
    availabilityMode: formData.get("availabilityMode") || "always",
    profileId: formData.get("profileId"),
    notes: formData.get("notes"),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  // Same E.164 rule as every other phone in the system (CLAUDE.md
  // conventions). A number we cannot normalise is kept as typed rather
  // than refused — a staff phone is for a human to ring, not for the
  // identity resolver, and refusing "9847 012345" would be officious.
  const phone = parsed.data.phone ? (normalizePhone(parsed.data.phone) ?? parsed.data.phone) : null;

  const supabase = await createClient();
  const values = {
    full_name: parsed.data.fullName,
    phone,
    email: parsed.data.email || null,
    employment_type: parsed.data.employmentType || null,
    availability_mode: parsed.data.availabilityMode,
    profile_id: parsed.data.profileId || null,
    notes: parsed.data.notes || null,
    is_active: parsed.data.isActive,
  };

  const { data, error } = id
    ? await supabase.from("faculty").update(values).eq("id", id).select("id").maybeSingle()
    : await supabase.from("faculty").insert(values).select("id").maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { error: "That login is already linked to another faculty member." };
    }
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: id ? "faculty.updated" : "faculty.created",
    entityType: "faculty",
    entityId: id ?? data?.id ?? null,
    after: values,
  });

  revalidatePath("/academics/faculty");
  return {
    success: id ? "Saved." : `${parsed.data.fullName} added.`,
    facultyId: id ?? data?.id,
  };
}

/**
 * Remove somebody from the roster.
 *
 * Soft, like everything else: the record of who taught Tuesday's class in
 * September must survive the person leaving in November.
 */
export async function archiveFaculty(id: string): Promise<FacultyFormState> {
  const user = await requireManager();
  if (!user) return DENIED;

  const supabase = await createClient();
  const { error } = await supabase
    .from("faculty")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", id);
  if (error) return { error: error.message };

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "faculty.archived",
    entityType: "faculty",
    entityId: id,
  });

  revalidatePath("/academics/faculty");
  return { success: "Removed from the roster." };
}

/**
 * Replace a person's whole list of subjects, or centres, in one go.
 *
 * Delete-then-insert rather than a diff. These are membership rows with no
 * history worth keeping — "Athira no longer teaches Drawing" is the
 * absence of a row — and a diff here would be more code for an identical
 * result on a list that is never longer than a dozen entries.
 */
export async function setFacultySubjects(
  facultyId: string,
  subjects: string[],
): Promise<FacultyFormState> {
  const user = await requireManager();
  if (!user) return DENIED;

  const clean = Array.from(new Set(subjects.map((s) => s.trim()).filter(Boolean)));
  const supabase = await createClient();

  const { error: clearError } = await supabase
    .from("faculty_subjects")
    .delete()
    .eq("faculty_id", facultyId);
  if (clearError) return { error: clearError.message };

  if (clean.length > 0) {
    const { error } = await supabase
      .from("faculty_subjects")
      .insert(clean.map((subject) => ({ faculty_id: facultyId, subject })));
    if (error) return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "faculty.subjects_set",
    entityType: "faculty",
    entityId: facultyId,
    after: { subjects: clean },
  });

  revalidatePath("/academics/faculty");
  return { success: "Subjects updated." };
}

export async function setFacultyCenters(
  facultyId: string,
  centerIds: string[],
): Promise<FacultyFormState> {
  const user = await requireManager();
  if (!user) return DENIED;

  const clean = Array.from(new Set(centerIds.filter(Boolean)));
  const supabase = await createClient();

  const { error: clearError } = await supabase
    .from("faculty_centers")
    .delete()
    .eq("faculty_id", facultyId);
  if (clearError) return { error: clearError.message };

  if (clean.length > 0) {
    const { error } = await supabase
      .from("faculty_centers")
      .insert(clean.map((centerId) => ({ faculty_id: facultyId, center_id: centerId })));
    if (error) return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "faculty.centers_set",
    entityType: "faculty",
    entityId: facultyId,
    after: { centerIds: clean },
  });

  revalidatePath("/academics/faculty");
  return { success: "Centres updated." };
}

const windowSchema = z.object({
  facultyId: z.string().uuid(),
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Use a time like 10:00"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Use a time like 13:00"),
});

export async function addAvailabilityWindow(
  _prev: FacultyFormState,
  formData: FormData,
): Promise<FacultyFormState> {
  const user = await requireManager();
  if (!user) return DENIED;

  const parsed = windowSchema.safeParse({
    facultyId: formData.get("facultyId"),
    dayOfWeek: formData.get("dayOfWeek"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the times." };
  }
  if (parsed.data.endTime <= parsed.data.startTime) {
    return { error: "The window has to end after it starts." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("faculty_availability").insert({
    faculty_id: parsed.data.facultyId,
    day_of_week: parsed.data.dayOfWeek,
    start_time: parsed.data.startTime,
    end_time: parsed.data.endTime,
  });
  if (error) return { error: error.message };

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "faculty.window_added",
    entityType: "faculty",
    entityId: parsed.data.facultyId,
    after: parsed.data,
  });

  revalidatePath("/academics/faculty");
  return { success: "Added." };
}

const leaveSchema = z.object({
  facultyId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date."),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an end date."),
  reason: z.string().trim().max(200).optional().or(z.literal("")),
});

export async function addLeave(
  _prev: FacultyFormState,
  formData: FormData,
): Promise<FacultyFormState> {
  const user = await requireManager();
  if (!user) return DENIED;

  const parsed = leaveSchema.safeParse({
    facultyId: formData.get("facultyId"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the dates." };
  }
  if (parsed.data.endDate < parsed.data.startDate) {
    return { error: "The leave cannot end before it starts." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("faculty_leave").insert({
    faculty_id: parsed.data.facultyId,
    start_date: parsed.data.startDate,
    end_date: parsed.data.endDate,
    reason: parsed.data.reason || null,
  });
  if (error) return { error: error.message };

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "faculty.leave_added",
    entityType: "faculty",
    entityId: parsed.data.facultyId,
    after: parsed.data,
  });

  revalidatePath("/academics/faculty");
  return { success: "Leave recorded." };
}

const REMOVABLE = {
  window: "faculty_availability",
  leave: "faculty_leave",
} as const;

/**
 * Drop one availability window or one leave period.
 *
 * A real delete, unlike almost everything else here: neither row records
 * something that happened, only something that is currently true. The
 * `kind` is looked up in a fixed map rather than interpolated, so a
 * tampered request cannot name a table this was never meant to touch.
 */
export async function removeFacultyRow(
  kind: keyof typeof REMOVABLE,
  id: string,
): Promise<FacultyFormState> {
  const user = await requireManager();
  if (!user) return DENIED;

  const table = REMOVABLE[kind];
  if (!table) return { error: "Nothing to remove." };

  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return { error: error.message };

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "faculty.row_removed",
    entityType: table,
    entityId: id,
  });

  revalidatePath("/academics/faculty");
  return { success: "Removed." };
}
