"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { NAV_ICONS } from "@/components/layout/nav-icons";
import { Button } from "@/components/ui/button";
import type { NavItem } from "@/lib/auth/nav";
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
 * Built on the dialog primitive already in the project rather than a new
 * dependency: it brings the focus trap, the Escape handling and the
 * scroll lock, which are the parts of a drawer that are easy to get
 * subtly wrong.
 */
export function MobileNav({ items, userName }: { items: NavItem[]; userName: string }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

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

      {open && (
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
                <p className="truncate text-sm text-muted-foreground">{userName}</p>
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
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = NAV_ICONS[item.iconKey];
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      // 48px rows: this is a list operated with a thumb
                      // while standing up, not a mouse at a desk.
                      "flex min-h-12 items-center gap-3 rounded-md px-3 text-[0.9375rem] font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-accent",
                    )}
                  >
                    <Icon className="size-5 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
