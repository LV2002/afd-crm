import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The people a manager may look in on, grouped by centre.
 *
 * Leon: *"i should be able to monitor all my counsellors."* The team
 * table on the dashboard already gives a row each; what it cannot do is
 * open one. This is the list behind the sub-navigation that can.
 *
 * ## Scoped by RLS, not by a filter here
 *
 * `profiles` has its own policy, and it is what limits a centre head to
 * the people at their centres while letting an admin see everybody. So
 * this asks for active profiles and whatever comes back is the answer —
 * no `center_id in (…)` clause, which would be a second, weaker copy of
 * a rule the database already enforces and is exactly the mistake
 * CLAUDE.md § 3 names.
 *
 * ## Why everyone, not only counsellors
 *
 * Membership is not filtered by role. Roles are editable rows, so
 * "counsellor" is a name an institute may not use; and a centre head
 * carries their own leads, which is the reason the Your-day widget
 * stopped being scope-restricted. Anybody who can hold a lead can be
 * worth looking in on.
 */

export interface TeamMember {
  userId: string;
  name: string;
  roleName: string | null;
  centerNames: string[];
}

export interface TeamCentre {
  /** Null for people who belong to no centre — see the grouping note. */
  centerId: string | null;
  centerName: string;
  members: TeamMember[];
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  role_id: string | null;
}

export async function getTeamMembers(
  supabase: SupabaseClient,
  /** Left out of their own list: a manager does not monitor themselves. */
  excludeUserId: string,
): Promise<TeamCentre[]> {
  const [{ data: profileRows }, { data: linkRows }, { data: centreRows }, { data: roleRows }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, role_id")
        .eq("is_active", true)
        .order("full_name")
        .returns<ProfileRow[]>(),
      supabase
        .from("user_centers")
        .select("user_id, center_id")
        .returns<Array<{ user_id: string; center_id: string }>>(),
      supabase
        .from("centers")
        .select("id, name")
        .is("deleted_at", null)
        .order("name")
        .returns<Array<{ id: string; name: string }>>(),
      supabase.from("roles").select("id, name").returns<Array<{ id: string; name: string }>>(),
    ]);

  const centreNameById = new Map((centreRows ?? []).map((row) => [row.id, row.name]));
  const roleNameById = new Map((roleRows ?? []).map((row) => [row.id, row.name]));

  const centreIdsByUser = new Map<string, string[]>();
  for (const link of linkRows ?? []) {
    const list = centreIdsByUser.get(link.user_id) ?? [];
    list.push(link.center_id);
    centreIdsByUser.set(link.user_id, list);
  }

  const members: TeamMember[] = (profileRows ?? [])
    .filter((row) => row.id !== excludeUserId)
    .map((row) => ({
      userId: row.id,
      // A profile with no name is a real state — somebody invited and not
      // yet signed in — and "Unnamed" is more use than a blank chip.
      name: row.full_name?.trim() || "Unnamed",
      roleName: row.role_id ? (roleNameById.get(row.role_id) ?? null) : null,
      centerNames: (centreIdsByUser.get(row.id) ?? [])
        .map((id) => centreNameById.get(id))
        .filter((name): name is string => Boolean(name)),
    }));

  /*
    Grouped by centre, and somebody at two centres appears under both.

    That is deliberate rather than a bug to tidy: a head of two centres
    scanning "who is at Kannur" wants the person who splits their week
    to be in that list, and a single "belongs to" would have to pick one
    centre arbitrarily. The pages they link to are the same page.
  */
  const byCentre = new Map<string, TeamMember[]>();
  const unplaced: TeamMember[] = [];
  for (const member of members) {
    if (member.centerNames.length === 0) {
      unplaced.push(member);
      continue;
    }
    for (const name of member.centerNames) {
      const list = byCentre.get(name) ?? [];
      list.push(member);
      byCentre.set(name, list);
    }
  }

  const centres: TeamCentre[] = (centreRows ?? [])
    .filter((row) => byCentre.has(row.name))
    .map((row) => ({
      centerId: row.id,
      centerName: row.name,
      members: byCentre.get(row.name) ?? [],
    }));

  // Last, and only when there is somebody in it. An admin who belongs to
  // no centre would otherwise head the list.
  if (unplaced.length > 0) {
    centres.push({ centerId: null, centerName: "No centre", members: unplaced });
  }

  return centres;
}
