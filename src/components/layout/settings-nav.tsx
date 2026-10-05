"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import type { SettingsNavItem } from "@/lib/settings/nav";
import { cn } from "@/lib/utils";

/**
 * The settings menu, which on a phone used to be the settings screen.
 *
 * Twenty-five links in a column, and the layout stacks them above the
 * content below `lg`. So opening Platform Health on a phone meant
 * scrolling past every other settings page to reach it, and scrolling all
 * the way back up to go anywhere else. The main navigation drawer was
 * built for exactly this reason and then this second menu was left as a
 * list — which is why "navigation doesn't work on mobile" was true even
 * though the drawer worked.
 *
 * From `lg` up it is unchanged: a sidebar beside the content, every item
 * visible, no interaction needed to see where you are.
 *
 * Below that it collapses to one row naming the screen you are on, which
 * opens the list. A disclosure rather than the tab strip used elsewhere in
 * the application: a row of twenty-five tabs is a horizontal scroll
 * through two screens' worth of names to find one, and the thing a person
 * does here is jump to a known destination, not browse.
 */
export function SettingsNav({ items }: { items: Pick<SettingsNavItem, "href" | "label">[] }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  // Close on navigation, or the list stays open over the page it just
  // took you to — which reads as the tap not having worked.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  // The longest match, not the first. `/settings/integrations/whatsapp` is
  // matched by `/settings/integrations` too, and naming the parent while
  // you stand on the child is the kind of small lie that makes a menu feel
  // broken.
  const current = items
    .filter((item) => isActive(item.href))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="settings-nav-list"
        className="flex min-h-11 items-center justify-between gap-2 rounded-md border px-3 text-sm font-medium lg:hidden"
      >
        <span className="min-w-0 truncate">{current?.label ?? "Settings"}</span>
        <ChevronDown
          className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      <nav
        id="settings-nav-list"
        aria-label="Settings"
        className={cn("flex-col gap-1", open ? "flex" : "hidden lg:flex")}
      >
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={cn(
              // 44px rows below `lg`, because this list is now operated
              // with a thumb. Unchanged on a desktop, where it is a dense
              // sidebar and always has been.
              "flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors lg:min-h-0 lg:py-2",
              isActive(item.href)
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
