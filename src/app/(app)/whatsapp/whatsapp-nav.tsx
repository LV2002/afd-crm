"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Two rows, because there are two different questions.
 *
 * The top row is **which conversation channel** — the institute's
 * Business API number and a counsellor's own WhatsApp. The second
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

  **WhatsApp Business Chat** is a counsellor's own number — where the one-to-one
  conversations happen and where every reply leaves from. It comes first
  because it is the daily work.

  **WhatsApp API** is the institute's broadcast number: campaign replies,
  templates, automations. It is administrative, so it sits last.
*/
const CHANNELS: Tab[] = [
  { href: "/whatsapp", label: "All chats" },
  { href: "/whatsapp/personal", label: "WhatsApp Business Chat" },
  // Only for people granted the WhatsApp API (the `whatsapp.campaign`
  // permission, held through a role): the institute's broadcast number,
  // its templates, broadcasts and automations.
  { href: "/whatsapp/api", label: "WhatsApp API", needs: "campaign" },
];

const BUSINESS_TABS: Tab[] = [
  { href: "/whatsapp/overview", label: "Overview", needs: "campaign" },
  { href: "/whatsapp/api", label: "Inbox" },
  { href: "/whatsapp/templates", label: "Templates", needs: "campaign" },
  { href: "/whatsapp/broadcasts", label: "Broadcasts", needs: "campaign" },
  { href: "/whatsapp/flows", label: "Automations", needs: "campaign" },
  { href: "/whatsapp/replies", label: "Saved replies & labels", needs: "campaign" },
  { href: "/whatsapp/forms", label: "Forms", needs: "campaign" },
  { href: "/whatsapp/auto-replies", label: "Auto replies & rules", needs: "campaign" },
  { href: "/whatsapp/links", label: "Tracked links", needs: "campaign" },
  { href: "/whatsapp/suppressions", label: "Opted out", needs: "campaign" },
];

const OTHER_CHANNEL_PREFIXES = ["/whatsapp/personal"];

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

  const onHub = pathname === "/whatsapp";
  const onPersonal = OTHER_CHANNEL_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  // Everything else under /whatsapp — the API inbox and its tools.
  const onApiSection = !onHub && !onPersonal;
  const visibleBusinessTabs = BUSINESS_TABS.filter((tab) =>
    tab.needs === "campaign" ? canCampaign : true,
  );

  return (
    <div className="flex flex-col gap-2 border-b pb-2">
      <nav className="flex flex-wrap gap-1">
        {CHANNELS.filter((channel) => (channel.needs === "campaign" ? canCampaign : true)).map((channel) => {
          const isActive =
            channel.href === "/whatsapp"
              ? onHub
              : channel.href === "/whatsapp/personal"
                ? onPersonal
                : onApiSection;
          return <TabLink key={channel.href} tab={channel} isActive={isActive} />;
        })}
      </nav>

      {onApiSection && visibleBusinessTabs.length > 1 && (
        <nav className="flex flex-wrap gap-1 pl-1">
          {visibleBusinessTabs.map((tab) => {
            const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
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
