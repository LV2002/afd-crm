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
  { href: "/finance/reconcile", label: "Reconciliation" },
  { href: "/finance/bank", label: "Bank import", needs: "record" },
  { href: "/finance/record", label: "Record entry", needs: "record" },
  { href: "/finance/accounts", label: "Bank & cash accounts", needs: "manage" },
];

export function FinanceNav({
  canRecord,
  canManage,
  openItems = 0,
}: {
  canRecord: boolean;
  canManage: boolean;
  /** Bank-reconciliation exceptions, shown in red beside the tab. */
  openItems?: number;
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
            {tab.href === "/finance/reconcile" && openItems > 0 && (
              <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {openItems}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
