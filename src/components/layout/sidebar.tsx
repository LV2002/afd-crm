"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { CounsellorLinks, type CounsellorLink } from "@/components/layout/counsellor-links";
import { NavBadge } from "@/components/layout/nav-badge";
import { NAV_ICONS } from "@/components/layout/nav-icons";
import type { NavItem } from "@/lib/auth/nav";
import type { NavBadgeCounts } from "@/lib/nav/badge-permissions";
import { cn } from "@/lib/utils";

/** The nav entry the counsellor list hangs from. */
const DASHBOARD_HREF = "/dashboard";

/**
 * `badges` is optional and arrives late on purpose. The layout renders this
 * once without it and once more when the counts resolve, so a slow count
 * query can never hold up the navigation itself — see app/(app)/layout.tsx.
 */
export function Sidebar({
  items,
  badges = {},
  counsellors = [],
}: {
  items: NavItem[];
  badges?: NavBadgeCounts;
  /**
   * Who a manager can look in on. Opens underneath Dashboard, and only while
   * Dashboard is open — see `CounsellorLinks`. Arrives late, like `badges`,
   * for the same reason: it must never hold up the navigation itself.
   */
  counsellors?: CounsellorLink[];
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-3">
      {items.map((item) => {
        const hasChildren = item.href === DASHBOARD_HREF && counsellors.length > 0;
        const isOpen = hasChildren && (pathname === item.href || pathname.startsWith(`${item.href}/`));
        // With people nested underneath, Dashboard itself is "here" only on
        // the overview. On a counsellor's page it is the PARENT of where you
        // are, and the person gets the filled chip instead — two solid chips
        // would make "where am I" a question again.
        const isActive = hasChildren
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = NAV_ICONS[item.iconKey];
        return (
          <div key={item.href} className="flex flex-col gap-0.5">
          <Link
            href={item.href}
            className={cn(
              // 44px rows and 15px text: this is the control everybody uses
              // dozens of times a day, on every screen size.
              "flex min-h-11 items-center gap-2.5 rounded-md px-3 py-2 text-[0.9375rem] font-medium transition-colors",
              // Filled, not washed. The active item was a 10% tint of the
              // accent, which on a white sidebar is a difference you have
              // to look for — and "where am I" should never be a question
              // you have to look for the answer to. A solid chip is
              // unmistakable at a glance and from across a desk.
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : isOpen
                  ? "bg-primary-subtle text-primary-ink"
                  : "text-foreground/80 hover:bg-primary-subtle hover:text-primary-ink",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="min-w-0 truncate">{item.label}</span>
            {item.badgeKey && (
              <NavBadge
                count={badges[item.badgeKey]}
                what={item.badgeWhat ?? "waiting"}
                // On the solid blue active row a solid red pill is red on
                // blue, which is the one pairing that fights. Inverted —
                // white pill, red figure — it is still unmistakably the
                // red count and it is far easier to read.
                className={isActive ? "bg-card text-destructive-ink" : undefined}
              />
            )}
          </Link>
          {isOpen && <CounsellorLinks counsellors={counsellors} pathname={pathname} />}
          </div>
        );
      })}
    </nav>
  );
}
