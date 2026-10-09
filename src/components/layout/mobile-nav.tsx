"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { createPortal } from "react-dom";

import { NavBadge } from "@/components/layout/nav-badge";
import { NAV_ICONS } from "@/components/layout/nav-icons";
import { Button } from "@/components/ui/button";
import type { NavItem } from "@/lib/auth/nav";
import type { NavBadgeCounts } from "@/lib/nav/badge-permissions";
import { cn } from "@/lib/utils";

/**
 * Navigation on a phone.
 *
 * Until now there wasn't any. The sidebar was `hidden md:flex` and
 * nothing replaced it, so on a phone you could see the screen you were
 * on and had no way to reach another one — for a sales team that works
 * from its phones, that made most of the application unreachable where
 * they actually stand.
 *
 * A drawer rather than a bottom tab bar, because the nav is role-aware:
 * a counsellor sees five items and an administrator fourteen, and a tab
 * bar that holds four of them has to decide which eight to hide. A drawer
 * holds all of them at a size a thumb can hit.
 *
 * Hand-rolled rather than built on the dialog primitive, because a
 * drawer is a different shape from a centred modal; Escape and the
 * scroll lock are handled below.
 *
 * ## Why the drawer is portalled to the body
 *
 * The trigger lives in the app header, and that header carries
 * `backdrop-blur`. An element with a `backdrop-filter` other than `none`
 * becomes the **containing block for fixed-position descendants** — same
 * rule as `transform` and `filter` — so `fixed inset-0` rendered in place
 * resolved against the header's own box instead of the viewport.
 *
 * Measured on a 412×915 phone: the drawer panel came out **55px tall**
 * instead of 915. Tapping the menu opened an unusable sliver across the
 * top of the screen, which is exactly what "the navigation does not work
 * on mobile" looked like — and it was invisible on a laptop, where the
 * sidebar is used and this component is `md:hidden`.
 *
 * Portalling to the body puts the drawer outside that containing block
 * for good, so it also cannot be re-broken by somebody adding a
 * `transform` or a `filter` to any ancestor later. `e2e/mobile.spec.ts`
 * opens the drawer and asserts its height against the viewport, which is
 * the check that was missing: the old test crawled pages for sideways
 * overflow and never opened the menu.
 */
export function MobileNav({
  items,
  userName,
  badges = {},
}: {
  items: NavItem[];
  userName: string;
  badges?: NavBadgeCounts;
}) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  // `document` does not exist while this renders on the server, so the
  // portal can only be created after mount.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Close on navigation. Without this the drawer stays open over the page
  // it just took you to, which reads as the tap not having worked.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu className="size-5" />
      </Button>

      {open &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="absolute inset-0 bg-foreground/40"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />

            <div
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              className="absolute inset-y-0 left-0 flex w-[min(19rem,85vw)] flex-col bg-background shadow-xl"
            >
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">AFD India CRM</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {userName}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Close menu"
                  onClick={() => setOpen(false)}
                >
                  <X className="size-5" />
                </Button>
              </div>

              <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
                {items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
                  const Icon = NAV_ICONS[item.iconKey];
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        // 48px rows: this is a list operated with a thumb
                        // while standing up, not a mouse at a desk.
                        "flex min-h-12 items-center gap-3 rounded-md px-3 text-[0.9375rem] font-medium transition-colors",
                        // Same filled chip as the sidebar, so "where am I"
                        // looks identical on a phone and on a laptop.
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-foreground hover:bg-primary-subtle hover:text-primary-ink",
                      )}
                    >
                      <Icon className="size-5 shrink-0" />
                      <span className="min-w-0 truncate">{item.label}</span>
                      {item.badgeKey && (
                        <NavBadge
                          count={badges[item.badgeKey]}
                          what={item.badgeWhat ?? "waiting"}
                          className={isActive ? "bg-card text-destructive-ink" : undefined}
                        />
                      )}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
