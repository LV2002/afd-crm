import "server-only";

import { cache } from "react";

import type { PermissionCode, PermissionScope } from "./permissions";
import { createClient } from "@/lib/supabase/server";

export type PermissionMap = Partial<Record<PermissionCode, PermissionScope>>;

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  roleId: string;
  roleCode: string;
  roleName: string;
  centerIds: string[];
  permissions: PermissionMap;
}

const SCOPE_RANK: Record<PermissionScope, number> = { own: 1, center: 2, all: 3 };

function widestScope(a: PermissionScope, b: PermissionScope): PermissionScope {
  return SCOPE_RANK[b] > SCOPE_RANK[a] ? b : a;
}

/**
 * Resolves the signed-in user's profile, role and permission bundle.
 *
 * Every query here goes through the server Supabase client (anon key +
 * session JWT), so it is bound by the same RLS a browser session would be
 * — this helper reads no more than the user themselves is allowed to.
 *
 * Returns null when there is no session or the profile is inactive/missing.
 *
 * ## Cached per request, and that is not an optimisation detail
 *
 * This is called from 165 places. A single page load runs it from the
 * layout, from the page, and from most components on it — and each run
 * used to cost FOUR network round trips to Supabase: `auth.getUser()`
 * (which is an HTTP call to the auth server, not a local token decode),
 * then the profile, the role's permissions and the user's centres.
 *
 * Five callers on one page meant twenty round trips before a single row
 * of actual data was fetched. At 60–100ms each from Vercel to Supabase
 * that is one to two seconds of nothing, on every click.
 *
 * React's `cache()` makes it once per request and free thereafter. It is
 * per-request only — a second visitor, or the same person's next click,
 * re-reads everything — so a permission change still takes effect on the
 * very next page load. Nothing is cached ACROSS requests on purpose:
 * stale permissions are a security bug, and this is the check that stands
 * between a counsellor and somebody else's leads.
 */
export const getCurrentUser = cache(async function getCurrentUser(): Promise<SessionUser | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url, is_active, role_id, roles(code, name)")
    .eq("id", user.id)
    .maybeSingle<{
      id: string;
      full_name: string;
      email: string;
      avatar_url: string | null;
      is_active: boolean;
      role_id: string;
      roles: { code: string; name: string } | null;
    }>();

  if (!profile || !profile.is_active || !profile.roles) return null;

  const [{ data: rolePermissions }, { data: userCenters }] = await Promise.all([
    supabase
      .from("role_permissions")
      .select("permission_code, scope")
      .eq("role_id", profile.role_id)
      .returns<Array<{ permission_code: PermissionCode; scope: PermissionScope }>>(),
    supabase
      .from("user_centers")
      .select("center_id")
      .eq("user_id", user.id)
      .returns<Array<{ center_id: string }>>(),
  ]);

  const permissions: PermissionMap = {};
  for (const row of rolePermissions ?? []) {
    const existing = permissions[row.permission_code];
    permissions[row.permission_code] = existing
      ? widestScope(existing, row.scope)
      : row.scope;
  }

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    avatarUrl: profile.avatar_url,
    roleId: profile.role_id,
    roleCode: profile.roles.code,
    roleName: profile.roles.name,
    centerIds: (userCenters ?? []).map((c) => c.center_id),
    permissions,
  };
});

/** Returns the scope the user holds for a permission, or undefined. */
export function scopeFor(user: SessionUser, code: PermissionCode): PermissionScope | undefined {
  return user.permissions[code];
}

/** True if the user holds the permission at any scope. */
export function can(user: SessionUser, code: PermissionCode): boolean {
  return user.permissions[code] !== undefined;
}
