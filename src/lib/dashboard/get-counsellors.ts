import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The counsellors a manager may look in on — the list under Dashboard in
 * the sidebar.
 *
 * Leon, after seeing the first version: *"I don't want to see the centers
 * or all the users I just want people with the role of counsellor to show
 * up, and I should be able to switch into each one of them to see their
 * performance."* So: counsellors only, one flat list, no centre headings.
 *
 * ## What "counsellor" means here
 *
 * Roles are editable rows, so a role's NAME is not something code can rely
 * on — an institute may call them "Admissions advisors". What makes a
 * counsellor a counsellor is that they work their own leads: they hold
 * `lead.read` at scope `own`. That is the same definition the assignment
 * picker already uses (`getAssignableUsers`), so the people you can assign
 * a lead to and the people you can look in on are one set, and a role an
 * admin creates tomorrow with that shape appears here with no change.
 * Centre heads, accounts and academics read at wider scope or don't read
 * leads, and so don't appear.
 *
 * ## Scoped by RLS, not by a filter here
 *
 * `profiles` has its own policy: it limits a centre head to the people at
 * their centres and lets an admin see everybody. So this asks for active
 * profiles in those roles and whatever comes back is the answer — no
 * `center_id in (…)` clause, which would be a second, weaker copy of a rule
 * the database already enforces (CLAUDE.md § 3).
 */

export interface Counsellor {
  userId: string;
  name: string;
  roleName: string | null;
}

export async function getCounsellors(
  supabase: SupabaseClient,
  /** Left out of their own list: a manager does not monitor themselves. */
  excludeUserId: string,
): Promise<Counsellor[]> {
  return (await getCounsellorsWithReason(supabase, excludeUserId)).counsellors;
}

/**
 * The list, plus why it is empty when it is.
 *
 * An empty list used to look identical whether no role is set up as a
 * counsellor role, or the people exist but this viewer's policies hide them
 * — and "I can't see them" cannot be fixed from either of those. The reason
 * is shown on the Dashboard so a manager (or Leon) can tell which it is.
 */
export type EmptyReason = "no_counsellor_role" | "no_visible_people" | null;

export async function getCounsellorsWithReason(
  supabase: SupabaseClient,
  excludeUserId: string,
): Promise<{ counsellors: Counsellor[]; reason: EmptyReason }> {
  const [{ data: permissionRows }, { data: roleRows }] = await Promise.all([
    supabase
      .from("role_permissions")
      .select("role_id")
      .eq("permission_code", "lead.read")
      .eq("scope", "own")
      .returns<Array<{ role_id: string }>>(),
    supabase.from("roles").select("id, name").returns<Array<{ id: string; name: string }>>(),
  ]);

  const counsellorRoleIds = [...new Set((permissionRows ?? []).map((row) => row.role_id))];
  if (counsellorRoleIds.length === 0) return { counsellors: [], reason: "no_counsellor_role" };

  const roleNameById = new Map((roleRows ?? []).map((row) => [row.id, row.name]));

  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, full_name, role_id")
    .eq("is_active", true)
    .in("role_id", counsellorRoleIds)
    .order("full_name")
    .returns<Array<{ id: string; full_name: string | null; role_id: string | null }>>();

  const counsellors = (profileRows ?? [])
    .filter((row) => row.id !== excludeUserId)
    .map((row) => ({
      userId: row.id,
      // A profile with no name is a real state — somebody invited and not
      // yet signed in — and "Unnamed" is more use than a blank row.
      name: row.full_name?.trim() || "Unnamed",
      roleName: row.role_id ? (roleNameById.get(row.role_id) ?? null) : null,
    }));
  return { counsellors, reason: counsellors.length === 0 ? "no_visible_people" : null };
}
