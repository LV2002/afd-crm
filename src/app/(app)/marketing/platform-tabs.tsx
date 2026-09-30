"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import type { AdPlatformDefinition } from "@/lib/integrations/platforms";

/**
 * All platforms, then one tab each.
 *
 * Its own component rather than the shared `SectionTabs` because the active
 * tab here is decided by a search param, not by the path — that component
 * reads only `usePathname()` and every tab would look inactive.
 *
 * The date range rides along. Switching from Meta to Google should not
 * silently reset the ninety days somebody just chose, which is what dropping
 * the other params would do.
 */
export function PlatformTabs({ platforms, active }: { platforms: AdPlatformDefinition[]; active: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function hrefFor(platform: string): string {
    const params = new URLSearchParams(searchParams.toString());
    if (platform) params.set("platform", platform);
    else params.delete("platform");
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  const tabs = [{ key: "", label: "All platforms" }, ...platforms];

  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto border-b pb-px" aria-label="Advertising platform">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key || "all"}
            href={hrefFor(tab.key)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
