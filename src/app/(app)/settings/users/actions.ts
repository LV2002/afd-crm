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

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "A password needs at least 8 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "The two passwords don't match",
    path: ["confirm"],
  });

/**
 * Sets a new password for somebody else's account.
 *
 * There was no way to do this at all: an admin set a password when
 * creating the account and nothing could change it afterwards, so the
 * first person to forget theirs was locked out until somebody opened the
 * Supabase dashboard. On a ten-person team that is a week-one problem.
 *
 * ## Why its own permission
 *
 * `users.manage` is held by centre heads for their own centres, and
 * editing somebody's record is not the same authority as taking over
 * their identity. `user.reset_password` ships granted to `admin` alone —
 * Leon's instruction, and the reason co-admin is seeded with everything
 * *except* this one. It remains an ordinary editable grant.
 *
 * ## The service-role exception
 *
 * Same narrow exception as `createUser` above, for the same reason:
 * Supabase has no "set another user's password" call under RLS-scoped
 * auth. The permission check runs against the caller's own session first,
 * service-role is used for exactly one call, and the audit entry goes
 * back through the RLS-bound client.
 *
 * The new password is never written to the audit log, never returned, and
 * never logged. What is recorded is that it happened, to whom, by whom.
 */
export async function resetUserPassword(
  userId: string,
  _prevState: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const actor = await getCurrentUser();
  if (!actor || !can(actor, "user.reset_password")) {
    return { error: "Only an administrator can reset a password." };
  }

  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();

  // Read the target through the caller's own client first. It confirms the
  // account exists and gives the audit entry a name — and on a database
  // where profiles are centre-scoped it is RLS, not this code, deciding
  // whether the caller may see them at all.
  const { data: target } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", userId)
    .maybeSingle<{ id: string; full_name: string; email: string }>();

  if (!target) {
    return { error: "That account no longer exists." };
  }

  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: parsed.data.password,
  });

  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: actor.id,
    action: "user.reset_password",
    entityType: "profiles",
    entityId: userId,
    // The password itself is deliberately absent. An audit trail that
    // records credentials is a second copy of them.
    after: { email: target.email, resetBy: actor.email },
  });

  revalidatePath(`/settings/users/${userId}`);
  return {
    success: `Password changed for ${target.full_name}. Tell them the new one — they will need it at the next sign-in.`,
  };
}
