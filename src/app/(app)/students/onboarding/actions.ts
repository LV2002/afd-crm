"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { getStudentChecklist } from "@/lib/students/onboarding-checklist";
import { createClient } from "@/lib/supabase/server";

export interface OnboardingState {
  error?: string;
  success?: string;
}

/** The id arrives from a hidden input, so it is checked before it reaches a query. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Academics accepting a student who has just arrived from accounts.
 *
 * Runs on the caller's own RLS-bound client, so there is no scope check to
 * re-implement here: `students_update` (migration 0017) already restricts
 * the row to `can_access_center('student.update', center_id)`, and a person
 * from the other centre gets zero rows updated rather than a refusal this
 * code had to remember to write.
 *
 * One way only. Completing onboarding is a handover, like the two gates
 * before it, and "un-accepting" a student a week into their course is not a
 * thing academics does — it is a mistake for an admin to correct, with the
 * audit trail to show it, not a button. So there is no undo, and the write
 * is guarded on `onboarded_at is null` so a double-click cannot restamp the
 * date or overwrite who did it.
 */
export async function completeOnboarding(
  _prevState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "student.update")) {
    return { error: "You don't have permission to do that." };
  }

  const studentId = String(formData.get("studentId") ?? "");
  if (!UUID.test(studentId)) return { error: "That is not a student." };

  const supabase = await createClient();

  // Every item on the checklist has to be ticked first. Enforced here, not
  // only by the button being disabled: a posted form is not the page.
  const checklist = await getStudentChecklist(supabase, studentId);
  const outstanding = checklist.filter((item) => !item.checked);
  if (outstanding.length > 0) {
    return {
      error: `Still to do: ${outstanding.map((i) => i.label).join("; ")}.`,
    };
  }
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("students")
    .update({ onboarded_at: now, onboarded_by: user.id })
    .eq("id", studentId)
    .is("onboarded_at", null)
    .is("deleted_at", null)
    .select("id, full_name")
    .maybeSingle<{ id: string; full_name: string }>();

  if (error) return { error: `Could not complete onboarding: ${error.message}` };
  if (!data) {
    // Either somebody else got there first, or this student is in a centre
    // this person cannot act on. Both read the same from here, and both mean
    // "nothing to do" rather than "something broke".
    return { error: "That student is already onboarded, or is not yours to onboard." };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "student.onboarded",
    entityType: "students",
    entityId: data.id,
    after: { onboardedAt: now },
  });

  // The whole layout, so the count beside Students in the sidebar goes down
  // along with the one on the tab.
  revalidatePath("/", "layout");
  return { success: `${data.full_name} is onboarded.` };
}

/**
 * Ticks or unticks one onboarding item for one student. Through the caller's
 * RLS client, so the policies on `student_onboarding_checks` decide who may.
 */
export async function setOnboardingCheck(studentId: string, itemId: string, checked: boolean): Promise<OnboardingState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "student.update")) return { error: "You don't have permission to do that." };
  if (!UUID.test(studentId) || !UUID.test(itemId)) return { error: "That is not a valid item." };

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, onboarded_at")
    .eq("id", studentId)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; onboarded_at: string | null }>();
  if (!student) return { error: "That student is not yours to update." };
  if (student.onboarded_at) return { error: "This student's onboarding is already complete." };

  const { error } = checked
    ? await supabase
        .from("student_onboarding_checks")
        .upsert({ student_id: studentId, item_id: itemId, checked_by: user.id, checked_at: new Date().toISOString() })
    : await supabase.from("student_onboarding_checks").delete().eq("student_id", studentId).eq("item_id", itemId);
  if (error) return { error: `Could not save: ${error.message}` };

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: checked ? "student.onboarding_item_checked" : "student.onboarding_item_unchecked",
    entityType: "students",
    entityId: studentId,
    after: { itemId },
  });
  revalidatePath("/students/onboarding");
  return {};
}
