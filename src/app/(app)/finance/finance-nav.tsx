"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

interface Tab {
  href: string;
  label: string;
  /** Omitted for tabs anyone with finance.read may open. */
  needs?: "record" | "manage";
}

const TABS: Tab[] = [
  { href: "/finance", label: "Dashboard" },
  { href: "/finance/collections", label: "Collections" },
  { href: "/finance/reports", label: "Monthly" },
  { href: "/finance/reports/year", label: "Yearly" },
  { href: "/finance/reports/cash-flow", label: "Cash flow" },
  { href: "/finance/transactions", label: "Transactions" },
  { href: "/finance/ledger", label: "Account ledger" },
  { href: "/finance/record", label: "Record entry", needs: "record" },
  { href: "/finance/accounts", label: "Accounts", needs: "manage" },
];

export function FinanceNav({
  canRecord,
  canManage,
}: {
  canRecord: boolean;
  canManage: boolean;
}) {
  const pathname = usePathname();

  const visible = TABS.filter((tab) => {
    if (tab.needs === "record") return canRecord;
    if (tab.needs === "manage") return canManage;
    return true;
  });

  return (
    <nav className="flex flex-wrap gap-1 border-b pb-2">
      {visible.map((tab) => {
        // Exact match only. Prefix matching would light up "Dashboard" on
        // every page, since every path starts with /finance.
        const isActive =
          pathname === tab.href ||
          (tab.href !== "/finance" && pathname.startsWith(`${tab.href}/`));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
