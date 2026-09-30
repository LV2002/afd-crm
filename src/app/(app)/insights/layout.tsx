import { SectionTabs, type SectionTab } from "@/components/layout/section-tabs";

/**
 * Insights is seven screens now, not one.
 *
 * The pivot answers "how many"; the six beside it answer questions the
 * pivot structurally cannot — which sources open versus close, how long
 * people take to decide, which districts and schools actually convert,
 * how much of the intake is word of mouth, what this quarter is on course
 * to land at, and what each counsellor actually did on a given day. They
 * share a tab row rather than seven sidebar entries.
 */
const TABS: SectionTab[] = [
  { href: "/insights", label: "Explore", exact: true },
  { href: "/insights/sources", label: "Sources" },
  { href: "/insights/timing", label: "Timing" },
  { href: "/insights/segments", label: "Segments" },
  { href: "/insights/referrals", label: "Referrals" },
  { href: "/insights/forecast", label: "Targets" },
  // Gated inside the page on report.center, not report.read like the rest:
  // one person's work shown to another is a different kind of report.
  { href: "/insights/activity", label: "Activity" },
];

export default function InsightsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <SectionTabs tabs={TABS} />
      {children}
    </div>
  );
}
