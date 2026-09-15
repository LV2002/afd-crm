import { SectionTabs, type SectionTab } from "@/components/layout/section-tabs";

/**
 * Insights is six screens now, not one.
 *
 * The pivot answers "how many"; the five beside it answer questions the
 * pivot structurally cannot — which sources open versus close, how long
 * people take to decide, which districts and schools actually convert,
 * how much of the intake is word of mouth, and what this quarter is on
 * course to land at. They share a tab row rather than six sidebar
 * entries.
 */
const TABS: SectionTab[] = [
  { href: "/insights", label: "Explore", exact: true },
  { href: "/insights/sources", label: "Sources" },
  { href: "/insights/timing", label: "Timing" },
  { href: "/insights/segments", label: "Segments" },
  { href: "/insights/referrals", label: "Referrals" },
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
