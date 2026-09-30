import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCentreView } from "@/lib/dashboard/get-scoreboard";
import { createClient } from "@/lib/supabase/server";

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
  const { centre } = await getCentreView(supabase);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline</CardTitle>
        <CardDescription>Everything open at your centre(s).</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Active leads" value={centre.activeLeads} />
          <StatTile
            label="Unassigned"
            value={centre.unassigned}
            hint={centre.unassigned > 0 ? "Nobody is working these" : "All owned"}
          />
          <StatTile label="Never contacted" value={centre.neverContacted} />
          <StatTile label="Overdue follow-ups" value={centre.overdueFollowups} />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="New this month" value={centre.newThisMonth} />
          <StatTile label="Admissions this month" value={centre.admissionsThisMonth} />
          <StatTile
            label="Admission rate"
            value={
              centre.admissionsPerLeadThisMonth === null
                ? "—"
                : `${centre.admissionsPerLeadThisMonth}%`
            }
            hint="This month's admissions ÷ new leads"
          />
          <StatTile label="SLA breached" value={centre.slaBreached} />
        </div>

        <div className="flex flex-wrap gap-4">
          <Link href="/leads" className="text-sm font-medium hover:underline">
            View leads →
          </Link>
          <Link href="/pipeline" className="text-sm font-medium hover:underline">
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
