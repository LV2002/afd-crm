"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export interface FormState {
  error?: string;
  success?: string;
}

/**
 * 32 bytes of CSPRNG output, base64url. The token is the only thing
 * protecting a public endpoint that creates leads, so it must be
 * unguessable — not a slug, not an incrementing id, and never derived from
 * the form's name. `randomBytes` rather than `Math.random`, which is not
 * cryptographically secure and would make tokens predictable from one
 * another.
 */
function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the form a name.").max(120),
  source: z.string().trim().min(1).max(120),
  centerId: z.string().uuid().nullable(),
  fieldKeys: z.array(z.string()).min(1, "Pick at least one question to ask."),
  introText: z.string().trim().max(2000).nullable(),
  successMessage: z.string().trim().max(2000).nullable(),
});

export async function createRegistrationForm(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const centerIdRaw = formData.get("centerId");
  const parsed = createSchema.safeParse({
    name: formData.get("name") ?? "",
    source: (formData.get("source") as string) || "Registration Form",
    centerId: typeof centerIdRaw === "string" && centerIdRaw.length > 0 ? centerIdRaw : null,
    fieldKeys: formData.getAll("fieldKeys").filter((v): v is string => typeof v === "string"),
    introText: ((formData.get("introText") as string) || "").trim() || null,
    successMessage: ((formData.get("successMessage") as string) || "").trim() || null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  // A form that never asks for a name and phone cannot produce a usable
  // lead: identity resolution needs both, and the submission would be
  // rejected at the far end. Catching it here means an admin finds out
  // while building the form rather than from a confused applicant.
  for (const required of ["student_name", "primary_phone"]) {
    if (!parsed.data.fieldKeys.includes(required)) {
      return { error: "The form must include both Student Name and Primary Phone." };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("registration_forms")
    .insert({
      name: parsed.data.name,
      token: generateToken(),
      source: parsed.data.source,
      center_id: parsed.data.centerId,
      field_keys: parsed.data.fieldKeys,
      intro_text: parsed.data.introText,
      success_message: parsed.data.successMessage,
      created_by: user.id,
    })
    .select("id, name")
    .single<{ id: string; name: string }>();

  if (error || !data) {
    return { error: `Could not create the form: ${error?.message ?? "unknown error"}` };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "registration_form.create",
    entityType: "registration_forms",
    entityId: data.id,
    after: { name: data.name, fieldKeys: parsed.data.fieldKeys },
  });

  revalidatePath("/settings/registration-forms");
  return { success: `Created “${data.name}”.` };
}

/**
 * Open/close a form. Deliberately reversible and deliberately not a
 * delete: closing stops new submissions while keeping the row, which is
 * what makes historic enquiries attributed to this form still readable.
 */
export async function setRegistrationFormActive(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const id = formData.get("id");
  const active = formData.get("active") === "true";
  if (typeof id !== "string") return { error: "Missing form reference." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("registration_forms")
    .update({ is_active: active })
    .eq("id", id)
    .select("id, name")
    .maybeSingle<{ id: string; name: string }>();

  if (error) return { error: `Could not update the form: ${error.message}` };
  if (!data) return { error: "That form could not be updated." };

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: active ? "registration_form.open" : "registration_form.close",
    entityType: "registration_forms",
    entityId: data.id,
    after: { isActive: active },
  });

  revalidatePath("/settings/registration-forms");
  return { success: active ? `“${data.name}” is now open.` : `“${data.name}” is now closed.` };
}
