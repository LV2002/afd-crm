import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyDashboard } from "@/lib/dashboard/get-scoreboard";
import { formatDateIST } from "@/lib/format/date";
import { INTERESTED_TEMPERATURES } from "@/lib/leads/interested-temperature";
import { createClient } from "@/lib/supabase/server";

import { DailyLeadsChart } from "./daily-leads-chart";
import { HeroStat } from "./hero-stat";
import { StatTile } from "./stat-tile";
import { TargetProgress } from "./target-progress";

/**
 * A counsellor's own numbers, above their queue.
 *
 * The queue answers "what do I do next". This answers "how am I doing",
 * which is the question they had to ask somebody else for. Both on one
 * screen was Leon's ask, and the order matters: the numbers set the context
 * and the queue is the work, so numbers first, then the list.
 *
 * ## Why three figures are bigger than the others
 *
 * This card used to be eight tiles of identical weight in two rows of
 * four. Eight equal numbers is a wall, not an answer — nothing said which
 * one to read first, and none of them said whether it was good. So the
 * three that answer "how is my month going" are promoted, each with last
 * month beside it and the shape of the last fortnight under it, and the
 * other five are demoted to a compact row. Same figures, same queries; the
 * difference is that the card now has a point of view.
 *
 * `assignedToday` is the one figure that needed a schema change. Until
 * migration 0071 there was no record of *when* a lead was handed to
 * somebody, so the nearest answer was "created today" — a different number
 * for any lead that gets reassigned, which is most of them once the orphan
 * queue is in use.
 */
export async function MyNumbersWidget({ userId }: { userId: string }) {
  const supabase = await createClient();
  const {
    scoreboard: board,
    series,
    admissionsTarget,
    cycleYearStart,
  } = await getMyDashboard(supabase, userId);

  const rate =
    board.admissionsPerLeadThisMonth === null ? "—" : `${board.admissionsPerLeadThisMonth}%`;

  // The last fortnight of the thirty days already fetched — enough for a
  // shape, short enough that a busy week still reads as one.
  const fortnight = series.slice(-14);
  const now = new Date();
  const cycleStartedOn = formatDateIST(cycleYearStart, "d MMM yyyy");
  // Named rather than listed as raw values, so the sentence reads the way
  // an admin sees them on the Temperature dropdown.
  const interestedLabels = INTERESTED_TEMPERATURES.map((value) =>
    value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
  ).join(", ");
  const dayOfMonth = Number(formatDateIST(now, "d"));
  const daysInMonth = Number(formatDateIST(new Date(now.getFullYear(), now.getMonth() + 1, 0), "d"));

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Your numbers</CardTitle>
        <CardDescription>This month so far, then the whole year to date.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <HeroStat
            label="Total leads this month"
            value={board.newThisMonth}
            previous={board.newLastMonth}
            series={fortnight.map((day) => day.leads)}
          />
          <HeroStat
            label="Admissions this month"
            value={board.admissionsThisMonth}
            previous={board.admissionsLastMonth}
            series={fortnight.map((day) => day.admissions)}
          />
          <HeroStat
            label="Follow-ups due"
            value={board.overdueFollowups + board.neverContacted}
            tone="attention"
            hint={
              board.overdueFollowups + board.neverContacted > 0
                ? `${board.overdueFollowups} overdue · ${board.neverContacted} never answered`
                : "Nothing overdue, nothing unanswered"
            }
          />
        </div>

        {admissionsTarget !== null && (
          <TargetProgress
            achieved={board.admissionsThisMonth}
            target={admissionsTarget}
            paceFraction={dayOfMonth / daysInMonth}
          />
        )}

        <DailyLeadsChart series={series} />

        {/*
          The year so far, as one population seen seven ways.

          These were the month's leftovers — assigned today, due today,
          SLA breached — each answering a different window from the one
          beside it. Leon asked for the year instead, and the single rule
          that makes the row add up is that every tile but the last is
          about leads that *arrived this cycle year*: new is the whole of
          it, contacted and never contacted split it in two, and active,
          overdue and interested are the parts of it still being worked.
        */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium">Your year so far</h3>
            <p className="text-xs text-muted-foreground">Since {cycleStartedOn}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Active leads" value={board.year.activeLeads} compact />
            <StatTile label="New leads" value={board.year.newLeads} compact />
            <StatTile label="Contacted" value={board.year.contacted} compact />
            <StatTile label="Never contacted" value={board.year.neverContacted} compact />
            <StatTile label="Overdue follow-ups" value={board.year.overdueFollowups} compact />
            <StatTile label="Interested" value={board.year.interested} compact />
            <StatTile label="Enrolments" value={board.year.enrolments} compact />
            <StatTile label="Admission rate" value={rate} compact />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          <strong>Interested</strong> counts anyone still being worked whose temperature is{" "}
          {interestedLabels}. <strong>Contacted</strong> and <strong>never contacted</strong> split
          this year&apos;s leads in two, so they always add up to new leads. Enrolments count by
          the date the admission was confirmed, so one confirmed this year on an older lead still
          counts here. The year runs from the month set in{" "}
          <Link href="/settings/organization" className="font-medium hover:underline">
            Settings → Organisation
          </Link>
          .
        </p>

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
