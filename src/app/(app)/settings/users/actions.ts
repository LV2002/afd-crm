"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export interface UserFormState {
  error?: string;
  success?: string;
}

const createSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  roleId: z.string().uuid("Pick a role"),
});

/**
 * Provisioning an auth user is the one operation in this settings surface
 * that genuinely cannot go through the anon/authenticated client — Supabase
 * has no "create another user with a password, as an admin" call under
 * normal RLS-scoped auth. This is the single, narrow exception to CLAUDE.md
 * non-negotiable #3: the permission check below runs against the caller's
 * own RLS-bound session BEFORE service-role is touched, service-role is
 * used for exactly one call (auth.admin.createUser), and everything else
 * — the profile row, the centre assignments, the audit log entry — goes
 * back through the normal RLS-bound client. See docs/DECISIONS.md.
 */
export async function createUser(
  _prevState: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const actor = await getCurrentUser();
  if (!actor || !can(actor, "users.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const parsed = createSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    roleId: formData.get("roleId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const centerIds = formData.getAll("centerIds").map(String).filter(Boolean);

  const admin = createServiceRoleClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    return { error: createError?.message ?? "Could not create the account." };
  }

  const supabase = await createClient();

  const { error: profileError } = await supabase.from("profiles").insert({
    id: created.user.id,
    full_name: parsed.data.fullName,
    email: parsed.data.email,
    role_id: parsed.data.roleId,
  });

  if (profileError) {
    // Roll back the orphaned auth user so retrying doesn't collide on email.
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: profileError.message };
  }

  if (centerIds.length > 0) {
    await supabase
      .from("user_centers")
      .insert(centerIds.map((centerId) => ({ user_id: created.user.id, center_id: centerId })));
  }

  await writeAuditLog(supabase, {
    actorId: actor.id,
    action: "user.create",
    entityType: "profiles",
    entityId: created.user.id,
    after: { fullName: parsed.data.fullName, email: parsed.data.email, roleId: parsed.data.roleId },
  });

  revalidatePath("/settings/users");
  redirect(`/settings/users/${created.user.id}`);
}

const updateSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().optional().or(z.literal("")),
  roleId: z.string().uuid("Pick a role"),
});

export async function updateUserProfile(
  userId: string,
  _prevState: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const actor = await getCurrentUser();
  if (!actor || !can(actor, "users.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const parsed = updateSchema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    roleId: formData.get("roleId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone || null,
      role_id: parsed.data.roleId,
    })
    .eq("id", userId);

  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: actor.id,
    action: "user.update",
    entityType: "profiles",
    entityId: userId,
    after: parsed.data,
  });

  revalidatePath("/settings/users");
  revalidatePath(`/settings/users/${userId}`);
  return { success: "Saved." };
}

export async function setUserActive(userId: string, isActive: boolean): Promise<void> {
  const actor = await getCurrentUser();
  if (!actor || !can(actor, "users.manage")) return;

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ is_active: isActive }).eq("id", userId);
  if (error) return;

  await writeAuditLog(supabase, {
    actorId: actor.id,
    action: isActive ? "user.activate" : "user.deactivate",
    entityType: "profiles",
    entityId: userId,
  });

  revalidatePath("/settings/users");
  revalidatePath(`/settings/users/${userId}`);
}
