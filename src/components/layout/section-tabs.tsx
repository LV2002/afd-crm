"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NavBadge } from "@/components/layout/nav-badge";
import { cn } from "@/lib/utils";

export interface SectionTab {
  href: string;
  label: string;
  /** Match this href exactly. Set on a section's index page, which is a prefix of all the others. */
  exact?: boolean;
  /** A red count on the tab. Omitted or zero shows nothing — see NavBadge. */
  badgeCount?: number;
  /** What the count is, in words, for the badge's accessible label. */
  badgeWhat?: string;
}

/**
 * A row of tabs across the top of a section.
 *
 * Reporting grew from one screen to five, and five entries in the main
 * sidebar for what a person thinks of as "the reports" is how a sidebar
 * stops being navigable. They are tabs within one section instead.
 *
 * Scrolls sideways rather than wrapping on a narrow screen: a tab row
 * that reflows to three lines pushes the actual report off the phone.
 */
export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const pathname = usePathname();

  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto border-b pb-px" aria-label="Section">
      {tabs.map((tab) => {
        const isActive = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              {tab.label}
              <NavBadge
                count={tab.badgeCount}
                what={tab.badgeWhat ?? "waiting"}
                className="ml-0"
              />
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
