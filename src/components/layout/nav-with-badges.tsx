import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";
import type { NavItem } from "@/lib/auth/nav";
import type { SessionUser } from "@/lib/auth/session";
import { canSeeTeam } from "@/lib/dashboard/can-see-team";
import { getCounsellors } from "@/lib/dashboard/get-counsellors";
import { getNavBadgeCounts } from "@/lib/nav/badge-counts";
import { createClient } from "@/lib/supabase/server";

/**
 * The nav, once its queue counts are known.
 *
 * Split out so the layout can render the nav immediately without them and
 * swap in the version with badges when the counts arrive:
 *
 *     <Suspense fallback={<Sidebar items={items} />}>
 *       <SidebarWithBadges items={items} user={user} />
 *     </Suspense>
 *
 * Which matters because this layout runs on every single navigation. Four
 * counts are cheap, but "cheap" added to the critical path of every click
 * is how an application comes to feel slow — and a sidebar that appears a
 * moment before its red numbers is strictly better than one that appears a
 * moment later with them.
 */
/**
 * The counsellors under Dashboard, for anybody who may read somebody else's
 * numbers.
 *
 * Gated on `report.center` — the same permission as the per-counsellor
 * pages the links open — so the entries and the screens appear and
 * disappear together. A counsellor holds `report.read` at `own` and never
 * sees the list, which is right: this is not a bar for looking sideways at
 * a colleague. Fetched alongside the badge counts, in the same Suspense
 * boundary, so it never sits on the critical path of a click.
 */
async function counsellorsFor(user: SessionUser) {
  if (!canSeeTeam(user)) return [];
  const supabase = await createClient();
  return getCounsellors(supabase, user.id);
}

export async function SidebarWithBadges({
  items,
  user,
}: {
  items: NavItem[];
  user: SessionUser;
}) {
  const [badges, counsellors] = await Promise.all([getNavBadgeCounts(user), counsellorsFor(user)]);
  return <Sidebar items={items} badges={badges} counsellors={counsellors} />;
}

export async function MobileNavWithBadges({
  items,
  user,
  userName,
}: {
  items: NavItem[];
  user: SessionUser;
  userName: string;
}) {
  const [badges, counsellors] = await Promise.all([getNavBadgeCounts(user), counsellorsFor(user)]);
  return <MobileNav items={items} userName={userName} badges={badges} counsellors={counsellors} />;
}
