import { SectionTabs, type SectionTab } from "@/components/layout/section-tabs";

/**
 * Insights is eight screens now, not one.
 *
 * The pivot answers "how many"; the seven beside it answer questions the
 * pivot structurally cannot — which sources open versus close, how long
 * people take to decide, how long an admission sits between the two
 * handover gates, which districts and schools actually convert, how much
 * of the intake is word of mouth, what this quarter is on course to land
 * at, and what each counsellor actually did on a given day. They share a
 * tab row rather than eight sidebar entries.
 */
const TABS: SectionTab[] = [
  { href: "/insights", label: "Explore", exact: true },
  { href: "/insights/sources", label: "Sources" },
  { href: "/insights/timing", label: "Timing" },
  // Next to Timing because it answers the same shape of question — how
  // long something takes — rather than next to the counting screens.
  { href: "/insights/handovers", label: "Handovers" },
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
      {/*
        The section's own title, here rather than in each of the eight
        pages — the same shape Finance uses. Without it these screens had
        no `h1` at all: every one opened with a sub-heading, which is a
        page with no name to anybody navigating by headings, and eight
        chances for the eight pages to word their title differently.
      */}
      <div>
        <h1 className="text-2xl font-semibold">Insights</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Who is coming in, where from, how fast they decide and how many enrol. Every tab
          draws its numbers before it lists them, and every chart has the table behind it.
        </p>
      </div>
      <SectionTabs tabs={TABS} />
      {children}
    </div>
  );
}
