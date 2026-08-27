"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { SettingsNavItem } from "@/lib/settings/nav";
import { cn } from "@/lib/utils";

export function SettingsNav({ items }: { items: Pick<SettingsNavItem, "href" | "label">[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
