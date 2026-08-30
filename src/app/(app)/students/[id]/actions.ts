"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { fieldColumn } from "@/lib/fields/field-column";
import { getFieldSchema } from "@/lib/fields/get-field-schema";
import { createClient } from "@/lib/supabase/server";

export interface FormState {
  error?: string;
  success?: string;
}

/**
 * Same one-path-through-the-field-schema write as `updateLead()` — a core
 * field to its real column, a custom one merged into `students.custom`.
 * Unlike leads, phone-type fields ARE handled here: a student's phone has
 * no dedup index to keep in sync (that's a `leads`-only concern, see
 * `updateLead`'s own comment) — academics correcting a typo just writes
 * the column directly.
 */
export async function updateStudent(studentId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "student.update")) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  const fields = await getFieldSchema(supabase, "student", user);

  const { data: existing, error: readError } = await supabase
    .from("students")
    .select("custom")
    .eq("id", studentId)
    .maybeSingle<{ custom: Record<string, unknown> | null }>();

  // Same reasoning as updateLead(): a transient read failure must not fall
  // through to `?? {}` below, or the update at the end would overwrite
  // every other custom value this student already had.
  if (readError) {
    return { error: `Could not load current field values: ${readError.message}` };
  }

  const coreUpdates: Record<string, unknown> = {};
  const customUpdates: Record<string, unknown> = { ...(existing?.custom ?? {}) };
  let touchedCustom = false;

  for (const field of fields) {
    if (!field.isEditable) continue;

    let value: unknown;
    if (field.type === "boolean") {
      value = formData.get(field.key) === "on";
    } else if (field.type === "multiselect") {
      value = formData.getAll(field.key).map(String).filter(Boolean);
    } else {
      const raw = formData.get(field.key);
      if (raw === null) continue; // field wasn't rendered in this form at all
      if (raw === "") {
        value = null;
      } else if (field.type === "number" || field.type === "currency") {
        value = Number(raw);
      } else {
        value = raw;
      }
    }

    if (field.isRequired && (value === null || value === "" || (Array.isArray(value) && value.length === 0))) {
      return { error: `${field.label} is required.` };
    }

    if (field.isCore) {
      coreUpdates[fieldColumn(field.key)] = value;
    } else {
      customUpdates[field.key] = value;
      touchedCustom = true;
    }
  }

  const payload = touchedCustom ? { ...coreUpdates, custom: customUpdates } : coreUpdates;
  const { error } = await supabase.from("students").update(payload).eq("id", studentId);
  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "student.update",
    entityType: "students",
    entityId: studentId,
    after: payload,
  });

  revalidatePath(`/students/${studentId}`);
  return { success: "Saved." };
}
