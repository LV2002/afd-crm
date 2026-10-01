import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";
import type { NavItem } from "@/lib/auth/nav";
import type { SessionUser } from "@/lib/auth/session";
import { getNavBadgeCounts } from "@/lib/nav/badge-counts";

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
export async function SidebarWithBadges({
  items,
  user,
}: {
  items: NavItem[];
  user: SessionUser;
}) {
  const badges = await getNavBadgeCounts(user);
  return <Sidebar items={items} badges={badges} />;
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
  const badges = await getNavBadgeCounts(user);
  return <MobileNav items={items} userName={userName} badges={badges} />;
}
