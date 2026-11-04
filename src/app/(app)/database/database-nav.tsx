"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/database", label: "Contacts" },
  { href: "/database/lists", label: "Lists" },
  { href: "/database/new", label: "Add a contact", manage: true },
  { href: "/database/import", label: "Import a file", manage: true },
];

export function DatabaseNav({ canManage }: { canManage: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b pb-2">
      {TABS.filter((t) => !t.manage || canManage).map((tab) => {
        // Exact for the root so "Contacts" is not lit on every page, and so a
        // contact's own page (/database/<id>) still counts as being in Contacts.
        const active =
          tab.href === "/database"
            ? pathname === "/database" || /^\/database\/[0-9a-f-]{36}$/i.test(pathname)
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
