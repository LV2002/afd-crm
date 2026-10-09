import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCentreView } from "@/lib/dashboard/get-scoreboard";
import { createClient } from "@/lib/supabase/server";

import { DailyLeadsChart } from "./daily-leads-chart";
import { HeroStat } from "./hero-stat";
import { StatTile } from "./stat-tile";

/**
 * The centre's pipeline, as a whole rather than per person.
 *
 * Runs through the RLS-bound client — no manual centre filtering needed,
 * `leads` and `enrolments` policies already restrict these rows to exactly
 * what the caller's `lead.read`/`enrolment.read` scope permits (centre for a
 * centre head, all for admin and co-admin holding the same bundle).
 *
 * The four figures it used to show were all "right now" — active,
 * unassigned, breached, admissions. Half of what a head needs is the
 * direction of travel, so the month's intake sits alongside them, and the
 * two numbers that represent somebody being let down (never contacted,
 * overdue) are here rather than only in the team table, because they are
 * true of the centre even when no single counsellor looks bad.
 */
export async function CentreWidget() {
  const supabase = await createClient();
  const { centre, series } = await getCentreView(supabase);
  const fortnight = series.slice(-14);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline</CardTitle>
        <CardDescription>Everything open at your centre(s).</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {/* The same three questions a counsellor's card answers, asked of
            the whole centre: what came in, what closed, and who is being
            let down right now. */}
        <div className="grid gap-3 sm:grid-cols-3">
          <HeroStat
            label="New leads this month"
            value={centre.newThisMonth}
            previous={centre.newLastMonth}
            series={fortnight.map((day) => day.leads)}
          />
          <HeroStat
            label="Admissions this month"
            value={centre.admissionsThisMonth}
            previous={centre.admissionsLastMonth}
            series={fortnight.map((day) => day.admissions)}
          />
          <HeroStat
            label="Nobody is on these"
            value={centre.unassigned + centre.neverContacted}
            tone="attention"
            hint={
              centre.unassigned + centre.neverContacted > 0
                ? `${centre.unassigned} unassigned · ${centre.neverContacted} never answered`
                : "Every lead is owned and answered"
            }
          />
        </div>

        <DailyLeadsChart series={series} />

        {/* The same rule as the counsellor's card: every figure it used to
            show is still here, and the two the hero adds together are
            listed apart, because an unassigned lead and an unanswered one
            are different problems with different fixes. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Active leads" value={centre.activeLeads} compact />
          <StatTile label="Unassigned" value={centre.unassigned} compact />
          <StatTile label="Never contacted" value={centre.neverContacted} compact />
          <StatTile label="Overdue follow-ups" value={centre.overdueFollowups} compact />
          <StatTile
            label="Admission rate"
            value={
              centre.admissionsPerLeadThisMonth === null
                ? "—"
                : `${centre.admissionsPerLeadThisMonth}%`
            }
            compact
          />
          <StatTile label="SLA breached" value={centre.slaBreached} compact />
        </div>

        <div className="flex flex-wrap gap-4">
          <Link href="/leads" className="text-sm font-medium hover:underline">
            View leads →
          </Link>
          <Link href="/follow-ups" className="text-sm font-medium hover:underline">
            Pipeline board →
          </Link>
          {centre.unassigned > 0 && (
            <Link href="/leads/orphans" className="text-sm font-medium hover:underline">
              Unassigned queue →
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
