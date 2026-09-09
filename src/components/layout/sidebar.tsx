"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ICONS } from "@/components/layout/nav-icons";
import type { NavItem } from "@/lib/auth/nav";
import { cn } from "@/lib/utils";

export function Sidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-3">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = NAV_ICONS[item.iconKey];
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              // 44px rows and 15px text: this is the control everybody uses
              // dozens of times a day, on every screen size.
              "flex min-h-11 items-center gap-2.5 rounded-md px-3 py-2 text-[0.9375rem] font-medium transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-foreground/80 hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
