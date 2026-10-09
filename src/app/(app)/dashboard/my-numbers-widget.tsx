import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyDashboard } from "@/lib/dashboard/get-scoreboard";
import { formatDateIST } from "@/lib/format/date";
import { interestedTemperatureLabels } from "@/lib/leads/interested-temperature";
import { createClient } from "@/lib/supabase/server";

import { HeroStat } from "./hero-stat";
import { TargetProgress } from "./target-progress";
import { YearTiles } from "./year-tiles";

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
export async function MyNumbersWidget({
  userId,
  title = "Your numbers",
  description = "This month so far, then the whole year to date.",
}: {
  userId: string;
  /**
   * Overridden when a manager is looking at somebody else's card, so it
   * reads "Athira's numbers" rather than "Your numbers" on a page that
   * is not about them. Same component, same queries — only the sentence
   * at the top changes, because two copies of this card would drift.
   */
  title?: string;
  description?: string;
}) {
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
  // The admin's own labels, in their own order, so the sentence reads the
  // way the Temperature dropdown does — and so a temperature nobody
  // ticked is visibly absent rather than quietly uncounted.
  const labels = await interestedTemperatureLabels(supabase);
  const interestedLabels = labels.length > 0 ? labels.join(", ") : "— none ticked yet";
  const dayOfMonth = Number(formatDateIST(now, "d"));
  const daysInMonth = Number(formatDateIST(new Date(now.getFullYear(), now.getMonth() + 1, 0), "d"));

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
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

        <YearTiles
          year={board.year}
          series={series}
          cycleStartedOn={cycleStartedOn}
          admissionRate={rate}
        />

        <p className="text-xs text-muted-foreground">
          <strong>Interested</strong> counts anyone still being worked whose temperature is{" "}
          {interestedLabels}. Change which ones count under{" "}
          <Link href="/settings/dropdowns/temperature" className="font-medium hover:underline">
            Settings → Dropdowns → Temperature
          </Link>
          . <strong>Contacted</strong> and <strong>never contacted</strong> split
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
