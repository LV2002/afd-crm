"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

interface Tab {
  href: string;
  label: string;
  /** Omitted for tabs anyone with whatsapp.read may open. */
  needs?: "campaign";
}

const TABS: Tab[] = [
  { href: "/whatsapp", label: "Inbox" },
  { href: "/whatsapp/templates", label: "Templates", needs: "campaign" },
  { href: "/whatsapp/broadcasts", label: "Broadcasts", needs: "campaign" },
];

export function WhatsAppNav({ canCampaign }: { canCampaign: boolean }) {
  const pathname = usePathname();

  const visible = TABS.filter((tab) => (tab.needs === "campaign" ? canCampaign : true));

  return (
    <nav className="flex flex-wrap gap-1 border-b pb-2">
      {visible.map((tab) => {
        // Exact match only for the inbox, or it lights up on every page in
        // the section.
        const isActive =
          pathname === tab.href ||
          (tab.href !== "/whatsapp" && pathname.startsWith(`${tab.href}/`));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
