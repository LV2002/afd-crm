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

const BUSINESS_TABS: Tab[] = [
  { href: "/whatsapp/overview", label: "Overview", needs: "campaign" },
  { href: "/whatsapp/api", label: "Inbox" },
  { href: "/whatsapp/templates", label: "Templates", needs: "campaign" },
  { href: "/whatsapp/broadcasts", label: "Broadcasts", needs: "campaign" },
  { href: "/whatsapp/flows", label: "Automations", needs: "campaign" },
  { href: "/whatsapp/replies", label: "Saved replies & labels", needs: "campaign" },
  { href: "/whatsapp/auto-replies", label: "Auto replies & rules", needs: "campaign" },
  { href: "/whatsapp/links", label: "Tracked links", needs: "campaign" },
  { href: "/whatsapp/spend", label: "Spend", needs: "campaign" },
  { href: "/whatsapp/suppressions", label: "Opted out", needs: "campaign" },
];

/**
 * The WhatsApp API's own tools: Templates, Broadcasts, Automations and the
 * rest. Shown only inside the API section. Which chat source you are in is
 * chosen from the nested list under Chats in the main navigation, not
 * from tabs on this page.
 */
export function WhatsAppNav({ canCampaign }: { canCampaign: boolean }) {
  const pathname = usePathname();

  const onApiSection = pathname.startsWith("/whatsapp/") && !pathname.startsWith("/whatsapp/personal");
  const visibleTabs = BUSINESS_TABS.filter((tab) => (tab.needs === "campaign" ? canCampaign : true));
  if (!onApiSection || visibleTabs.length < 2) return null;

  return (
    <nav className="flex flex-wrap gap-1 border-b pb-2">
      {visibleTabs.map((tab) => {
        const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
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
