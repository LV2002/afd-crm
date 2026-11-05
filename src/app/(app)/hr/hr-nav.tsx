"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function HrNav({ tabs }: { tabs: Array<{ href: string; label: string }> }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b pb-2">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            pathname === tab.href || pathname.startsWith(`${tab.href}/`)
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:bg-accent/50",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
