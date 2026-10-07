"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Two rows, because there are two different questions.
 *
 * The top row is **which conversation channel** — the institute's
 * Business API number, a counsellor's own WhatsApp, Instagram. The second
 * is what you want to do within the Business API channel, and only
 * applies there: there are no broadcast templates for somebody's personal
 * WhatsApp, and showing them under it would imply there could be.
 */

interface Tab {
  href: string;
  label: string;
  /** Omitted for tabs anyone with whatsapp.read may open. */
  needs?: "campaign";
}

/*
  Order is the point, not just the labels.

  **WhatsApp** is a counsellor's own number — where the one-to-one
  conversations happen and where every reply leaves from. It comes first
  because it is the daily work.

  **WhatsApp API** is the institute's broadcast number: campaign replies,
  templates, automations. It is administrative, so it sits last, after
  Instagram.
*/
const CHANNELS: Tab[] = [
  { href: "/whatsapp/personal", label: "WhatsApp" },
  { href: "/whatsapp/instagram", label: "Instagram" },
  { href: "/whatsapp", label: "WhatsApp API" },
];

const BUSINESS_TABS: Tab[] = [
  { href: "/whatsapp", label: "Inbox" },
  { href: "/whatsapp/templates", label: "Templates", needs: "campaign" },
  { href: "/whatsapp/broadcasts", label: "Broadcasts", needs: "campaign" },
  { href: "/whatsapp/flows", label: "Automations", needs: "campaign" },
  { href: "/whatsapp/suppressions", label: "Opted out", needs: "campaign" },
];

const OTHER_CHANNEL_PREFIXES = ["/whatsapp/personal", "/whatsapp/instagram"];

function TabLink({ tab, isActive }: { tab: Tab; isActive: boolean }) {
  return (
    <Link
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
}

export function WhatsAppNav({ canCampaign }: { canCampaign: boolean }) {
  const pathname = usePathname();

  const onOtherChannel = OTHER_CHANNEL_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const visibleBusinessTabs = BUSINESS_TABS.filter((tab) =>
    tab.needs === "campaign" ? canCampaign : true,
  );

  return (
    <div className="flex flex-col gap-2 border-b pb-2">
      <nav className="flex flex-wrap gap-1">
        {CHANNELS.map((channel) => {
          const isActive =
            channel.href === "/whatsapp"
              ? !onOtherChannel
              : pathname === channel.href || pathname.startsWith(`${channel.href}/`);
          return <TabLink key={channel.href} tab={channel} isActive={isActive} />;
        })}
      </nav>

      {!onOtherChannel && visibleBusinessTabs.length > 1 && (
        <nav className="flex flex-wrap gap-1 pl-1">
          {visibleBusinessTabs.map((tab) => {
            // Exact match only for the inbox, or it lights up on every
            // page in the section.
            const isActive =
              pathname === tab.href ||
              (tab.href !== "/whatsapp" && pathname.startsWith(`${tab.href}/`));
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
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
      )}
    </div>
  );
}
