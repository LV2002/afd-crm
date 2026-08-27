"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { isPermissionCode, PERMISSION_SCOPES, type PermissionScope } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export interface RoleFormState {
  error?: string;
  success?: string;
}

const codeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, numbers and underscores, starting with a letter");

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  code: codeSchema,
  description: z.string().trim().optional().or(z.literal("")),
});

export async function createRole(
  _prevState: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "roles.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("roles")
    .insert({
      name: parsed.data.name,
      code: parsed.data.code,
      description: parsed.data.description || null,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "role.create",
    entityType: "roles",
    entityId: data.id,
    after: parsed.data,
  });

  revalidatePath("/settings/roles");
  redirect(`/settings/roles/${data.id}`);
}

const updateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().optional().or(z.literal("")),
});

export async function updateRole(
  roleId: string,
  _prevState: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "roles.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const parsed = updateSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("roles")
    .update({ name: parsed.data.name, description: parsed.data.description || null })
    .eq("id", roleId);

  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "role.update",
    entityType: "roles",
    entityId: roleId,
    after: parsed.data,
  });

  revalidatePath("/settings/roles");
  revalidatePath(`/settings/roles/${roleId}`);
  return { success: "Saved." };
}

export interface PermissionsFormState {
  error?: string;
  success?: string;
}

/**
 * The permission grid posts one field per permission code, named
 * `perm.<code>`, valued 'none' | 'own' | 'center' | 'all'. 'none' means the
 * role doesn't hold that permission at all, so it's a delete rather than an
 * upsert with a scope.
 */
export async function updateRolePermissions(
  roleId: string,
  _prevState: PermissionsFormState,
  formData: FormData,
): Promise<PermissionsFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "roles.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  const toGrant: Array<{ role_id: string; permission_code: string; scope: PermissionScope }> = [];
  const toRevoke: string[] = [];

  for (const [key, rawValue] of formData.entries()) {
    if (!key.startsWith("perm.")) continue;
    const code = key.slice("perm.".length);
    if (!isPermissionCode(code)) continue;

    const value = String(rawValue);
    if (value === "none") {
      toRevoke.push(code);
    } else if ((PERMISSION_SCOPES as readonly string[]).includes(value)) {
      toGrant.push({ role_id: roleId, permission_code: code, scope: value as PermissionScope });
    }
  }

  if (toRevoke.length > 0) {
    const { error } = await supabase
      .from("role_permissions")
      .delete()
      .eq("role_id", roleId)
      .in("permission_code", toRevoke);
    if (error) {
      return { error: error.message };
    }
  }

  if (toGrant.length > 0) {
    const { error } = await supabase
      .from("role_permissions")
      .upsert(toGrant, { onConflict: "role_id,permission_code" });
    if (error) {
      return { error: error.message };
    }
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "role.update_permissions",
    entityType: "roles",
    entityId: roleId,
    after: { granted: toGrant, revoked: toRevoke },
  });

  revalidatePath(`/settings/roles/${roleId}`);
  return { success: "Permissions saved." };
}

export interface DeleteRoleState {
  error?: string;
}

export async function deleteRole(roleId: string): Promise<DeleteRoleState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "roles.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("roles").delete().eq("id", roleId);

  if (error) {
    // Covers both the protect_admin_role trigger and the profiles FK
    // restrict (a role with active users can't be deleted either).
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "role.delete",
    entityType: "roles",
    entityId: roleId,
  });

  revalidatePath("/settings/roles");
  return {};
}
