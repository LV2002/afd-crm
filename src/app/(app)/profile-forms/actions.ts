"use server";

import { revalidatePath } from "next/cache";

import { can, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export interface ReviewState {
  error?: string;
  success?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Marking a submitted profile form read.
 *
 * The step that makes the red count on Student Profile Forms mean
 * something: until somebody does this, the form is new, and the badge is
 * the number of students waiting to be looked at.
 *
 * Runs on the caller's RLS-bound client, so there is no scope check to
 * re-implement — `leads_update` already restricts the row to
 * `can_access_center('lead.update', …)`, and somebody from another centre
 * updates zero rows rather than being refused by code that had to remember
 * to check.
 *
 * No audit row. Reading a form is not a change to the student's record —
 * it is a receipt for attention — and an audit log that fills with
 * "somebody looked at something" is an audit log nobody can search.
 */
export async function markProfileFormRead(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.update")) {
    return { error: "You don't have permission to do that." };
  }

  const leadId = String(formData.get("leadId") ?? "");
  if (!UUID.test(leadId)) return { error: "That is not a lead." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .update({ profile_form_reviewed_at: new Date().toISOString(), profile_form_reviewed_by: user.id })
    .eq("id", leadId)
    .is("deleted_at", null)
    // Guarded both ways: an unsubmitted form has nothing to read, and a
    // second click must not restamp the date or overwrite who read it
    // first.
    .not("profile_form_submitted_at", "is", null)
    .is("profile_form_reviewed_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) return { error: `Could not mark it read: ${error.message}` };
  if (!data) return { error: "Already marked read, or not yours to mark." };

  revalidatePath("/profile-forms");
  revalidatePath(`/leads/${leadId}`);
  return { success: "Marked read." };
}
