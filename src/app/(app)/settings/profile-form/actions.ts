"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export interface QuestionActionResult {
  error?: string;
}

/**
 * The screens whose contents change when a question moves, is renamed, or
 * goes on or off the form. The public form itself is not listed: it is
 * rendered per-token on request, never cached as a route.
 */
function revalidateProfileForm(): void {
  revalidatePath("/settings/profile-form");
  revalidatePath("/settings/fields");
  revalidatePath("/profile-forms");
}

async function requireSettingsManager() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return null;
  return user;
}

/**
 * Puts a question on, or takes it off, the student-facing profile form.
 *
 * Distinct from deactivating the field: a question taken off the form is
 * still a live part of the student record, filled in by staff. Batch,
 * centre and enrolment status are the obvious cases — real fields that no
 * student should be answering about themselves.
 */
export async function setQuestionOnForm(
  fieldId: string,
  onForm: boolean,
): Promise<QuestionActionResult> {
  const user = await requireSettingsManager();
  if (!user) return { error: "You don't have permission to do that." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("field_definitions")
    .update({ on_profile_form: onForm })
    .eq("id", fieldId)
    .eq("entity", "student");
  if (error) return { error: error.message };

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: onForm ? "field_definition.profile_form_add" : "field_definition.profile_form_remove",
    entityType: "field_definitions",
    entityId: fieldId,
  });

  revalidateProfileForm();
  return {};
}

/** Whether a student must answer before the form will submit. */
export async function setQuestionRequired(
  fieldId: string,
  isRequired: boolean,
): Promise<QuestionActionResult> {
  const user = await requireSettingsManager();
  if (!user) return { error: "You don't have permission to do that." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("field_definitions")
    .update({ is_required: isRequired })
    .eq("id", fieldId)
    .eq("entity", "student");
  if (error) return { error: error.message };

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "field_definition.update",
    entityType: "field_definitions",
    entityId: fieldId,
    after: { is_required: isRequired },
  });

  revalidateProfileForm();
  return {};
}

/**
 * Moves a question one place up or down the form.
 *
 * Every student field is renumbered to its position first. `sort_order`
 * has no uniqueness constraint and the seed has historically written the
 * same values more than once, so swapping two rows' values without
 * normalising first can be a silent no-op — the button would appear
 * broken. Renumbering is idempotent and only writes the rows that
 * actually change.
 *
 * The swap happens among the questions ON the form, not among all student
 * fields, because that is the list the admin is looking at. Swapping
 * against a hidden neighbour would look like nothing happened.
 */
export async function moveQuestion(
  fieldId: string,
  direction: "up" | "down",
): Promise<QuestionActionResult> {
  const user = await requireSettingsManager();
  if (!user) return { error: "You don't have permission to do that." };

  const supabase = await createClient();
  const { data: rows, error: readError } = await supabase
    .from("field_definitions")
    .select("id, sort_order, on_profile_form")
    .eq("entity", "student")
    .is("deleted_at", null)
    .order("sort_order")
    .order("key")
    .returns<Array<{ id: string; sort_order: number; on_profile_form: boolean }>>();
  if (readError) return { error: readError.message };

  const all = rows ?? [];
  const order = new Map(all.map((row, index) => [row.id, index]));

  const onForm = all.filter((row) => row.on_profile_form);
  const position = onForm.findIndex((row) => row.id === fieldId);
  if (position === -1) return { error: "That question isn't on the form." };

  const neighbour = onForm[direction === "up" ? position - 1 : position + 1];
  if (!neighbour) return {}; // Already at the end. Nothing to do, and not an error.

  const movedTo = order.get(neighbour.id)!;
  const neighbourTo = order.get(fieldId)!;
  order.set(fieldId, movedTo);
  order.set(neighbour.id, neighbourTo);

  const writes = all
    .filter((row) => order.get(row.id) !== row.sort_order)
    .map((row) =>
      supabase
        .from("field_definitions")
        .update({ sort_order: order.get(row.id)! })
        .eq("id", row.id),
    );
  const results = await Promise.all(writes);
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "field_definition.reorder",
    entityType: "field_definitions",
    entityId: fieldId,
    after: { direction },
  });

  revalidateProfileForm();
  return {};
}
