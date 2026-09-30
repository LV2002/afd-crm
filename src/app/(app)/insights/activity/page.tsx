import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { can, getCurrentUser } from "@/lib/auth/session";
import { formatDateIST } from "@/lib/format/date";
import {
  formatTalkTime,
  summariseActivity,
  totalActivity,
  type ActivityInteraction,
} from "@/lib/reports/activity-log";
import { createClient } from "@/lib/supabase/server";

import { DayPicker } from "./day-picker";
import { PersonActivity } from "./person-activity";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today in Asia/Kolkata, as `YYYY-MM-DD`. */
function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

/**
 * What each counsellor actually did on a given day.
 *
 * A centre head's daily question is not "how is the pipeline" — the
 * dashboard answers that — but "did my people work yesterday, and on whom".
 * Until now the only record was the timeline on each individual lead, so
 * answering it meant opening forty leads one at a time.
 *
 * Gated on `report.center`: this is one person's work shown to another
 * person, the same bar as the counsellor-performance card. A counsellor
 * holds `report.read` at `own` scope and so never reaches it — their own
 * activity is on the leads they worked.
 *
 * `interactions` has no `center_id`, so it cannot be centre-scoped by its
 * own RLS policy. The scoping therefore comes from the lead each interaction
 * hangs off: the join to `leads` is inner, and `leads` RLS already restricts
 * that to the caller's centres. A centre head reading this page sees
 * activity on their own centres' leads and nothing else — which is also why
 * the query cannot be written the other way round, selecting interactions
 * first and resolving names afterwards.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !can(user, "report.center")) return <AccessDenied />;

  const { day: requested } = await searchParams;
  const day = requested && ISO_DATE.test(requested) ? requested : todayIST();

  // Half-open, in IST: everything from midnight up to but not including the
  // next midnight. An inclusive upper bound would double-count an
  // interaction logged at exactly 00:00:00 on two consecutive days.
  const from = `${day}T00:00:00+05:30`;
  const to = `${day}T24:00:00+05:30`;

  const supabase = await createClient();

  const [{ data: rows }, { data: memberRows }] = await Promise.all([
    supabase
      .from("interactions")
      .select(
        "id, lead_id, type, direction, outcome, occurred_at, duration_seconds, created_by, notes, next_followup_at, leads!inner(student_name)",
      )
      .gte("occurred_at", from)
      .lt("occurred_at", to)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .returns<
        Array<{
          id: string;
          lead_id: string;
          type: string;
          direction: "inbound" | "outbound" | null;
          outcome: string | null;
          occurred_at: string;
          duration_seconds: number | null;
          created_by: string | null;
          notes: string | null;
          next_followup_at: string | null;
          leads: { student_name: string } | null;
        }>
      >(),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("is_active", true)
      .order("full_name")
      .returns<Array<{ id: string; full_name: string | null }>>(),
  ]);

  const interactions: ActivityInteraction[] = (rows ?? []).map((row) => ({
    id: row.id,
    leadId: row.lead_id,
    leadName: row.leads?.student_name ?? "Unknown",
    type: row.type,
    direction: row.direction,
    outcome: row.outcome,
    occurredAt: row.occurred_at,
    durationSeconds: row.duration_seconds,
    createdBy: row.created_by,
    notes: row.notes,
    nextFollowupAt: row.next_followup_at,
  }));

  // Only people who have ever logged something, plus anybody who logged
  // today. Listing every active profile would put the accountant and the
  // academics staff in a counsellor activity table, where a zero against
  // their name means nothing.
  const everWorked = await supabase
    .from("interactions")
    .select("created_by")
    .not("created_by", "is", null)
    .is("deleted_at", null)
    .limit(5000)
    .returns<Array<{ created_by: string }>>();

  const workerIds = new Set([
    ...(everWorked.data ?? []).map((row) => row.created_by),
    ...interactions.map((row) => row.createdBy).filter((id): id is string => id !== null),
  ]);

  const members = (memberRows ?? [])
    .filter((row) => workerIds.has(row.id))
    .map((row) => ({ userId: row.id, name: row.full_name ?? "Unnamed" }));

  const summaries = summariseActivity({ members, interactions });
  const totals = totalActivity(summaries, interactions);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Counsellor activity</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Every call, message and walk-in logged on{" "}
            <strong>{formatDateIST(`${day}T06:00:00Z`, "EEEE d MMMM yyyy")}</strong>, by whom and
            against which lead.
          </p>
        </div>
        <DayPicker day={day} today={todayIST()} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>The day, across everybody</CardTitle>
          <CardDescription>
            {totals.interactions === 0
              ? "Nothing logged at all on this day."
              : `${totals.interactions} interactions with ${totals.peopleContacted} ${
                  totals.peopleContacted === 1 ? "person" : "people"
                }, by ${totals.activeCounsellors} of ${summaries.length}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {totals.byType.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {totals.byType.map((entry) => (
                <Badge key={entry.value} variant="secondary">
                  {entry.value}: {entry.count}
                </Badge>
              ))}
            </div>
          ) : null}

          {totals.byOutcome.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Outcomes</span>
              <div className="flex flex-wrap gap-2">
                {totals.byOutcome.map((entry) => (
                  <Badge key={entry.value} variant="outline">
                    {entry.value}: {entry.count}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {totals.silent > 0 ? (
            <p className="text-sm text-muted-foreground">
              {totals.silent} {totals.silent === 1 ? "person" : "people"} logged nothing on this
              day.
            </p>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Outcomes are shown exactly as they were recorded, using the list in Settings →
            Dropdowns. Nothing here decides for you which of them counts as having reached
            somebody — that judgement stays with the names you chose.
          </p>
        </CardContent>
      </Card>

      {summaries.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nobody has logged an interaction yet. Once counsellors start logging calls, each one gets
          a row here.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {summaries.map((person) => (
            <PersonActivity key={person.userId} person={person} talkTime={formatTalkTime(person.talkTimeSeconds)} />
          ))}
        </div>
      )}
    </div>
  );
}
