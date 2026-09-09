import { SectionTabs, type SectionTab } from "@/components/layout/section-tabs";

/**
 * Insights is five screens now, not one.
 *
 * The pivot answers "how many"; the four beside it answer questions the
 * pivot structurally cannot — which sources open versus close, how long
 * people take to decide, which districts and schools actually convert,
 * and what this quarter is on course to land at. They share a tab row
 * rather than five sidebar entries.
 */
const TABS: SectionTab[] = [
  { href: "/insights", label: "Explore", exact: true },
  { href: "/insights/sources", label: "Sources" },
  { href: "/insights/timing", label: "Timing" },
  { href: "/insights/segments", label: "Segments" },
  { href: "/insights/forecast", label: "Targets" },
];

export default function InsightsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <SectionTabs tabs={TABS} />
      {children}
    </div>
  );
}
