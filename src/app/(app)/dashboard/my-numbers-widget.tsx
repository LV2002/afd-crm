import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyScoreboard } from "@/lib/dashboard/get-scoreboard";
import { createClient } from "@/lib/supabase/server";

import { StatTile } from "./stat-tile";

/**
 * A counsellor's own numbers, above their queue.
 *
 * The queue answers "what do I do next". This answers "how am I doing",
 * which is the question they had to ask somebody else for. Both on one
 * screen was Leon's ask, and the order matters: the numbers set the context
 * and the queue is the work, so numbers first, then the list.
 *
 * `assignedToday` is the one figure that needed a schema change. Until
 * migration 0071 there was no record of *when* a lead was handed to
 * somebody, so the nearest answer was "created today" — a different number
 * for any lead that gets reassigned, which is most of them once the orphan
 * queue is in use.
 */
export async function MyNumbersWidget({ userId }: { userId: string }) {
  const supabase = await createClient();
  const board = await getMyScoreboard(supabase, userId);

  const rate =
    board.admissionsPerLeadThisMonth === null
      ? "—"
      : `${board.admissionsPerLeadThisMonth}%`;

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Your numbers</CardTitle>
        <CardDescription>This month so far, and what landed on your desk today.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Active leads" value={board.activeLeads} hint="Not yet won or lost" />
          <StatTile label="Assigned today" value={board.assignedToday} />
          <StatTile label="New this month" value={board.newThisMonth} />
          <StatTile
            label="Never contacted"
            value={board.neverContacted}
            hint={board.neverContacted > 0 ? "Start here" : "All answered"}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Admissions this month" value={board.admissionsThisMonth} />
          <StatTile
            label="Admission rate"
            value={rate}
            hint={
              board.admissionsPerLeadThisMonth === null
                ? "No new leads yet this month"
                : "This month's admissions ÷ new leads"
            }
          />
          <StatTile label="Overdue follow-ups" value={board.overdueFollowups} />
          <StatTile label="SLA breached" value={board.slaBreached} />
        </div>

        <p className="text-xs text-muted-foreground">
          The admission rate is a running figure for the month, not the share of your leads that
          eventually enrol — most of this month&apos;s admissions came from leads that arrived
          earlier.{" "}
          <Link href="/insights/segments" className="font-medium hover:underline">
            Cohort conversion →
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
