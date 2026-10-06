import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  formatDateIST,
  lastDaysIST,
  startOfDayIST,
  startOfMonthIST,
  startOfTomorrowIST,
} from "@/lib/format/date";

import {
  buildCentreScoreboard,
  buildCounsellorScoreboard,
  buildDailySeries,
  buildTeamScoreboard,
  type Boundaries,
  type DailyCount,
  type CentreScoreboard,
  type CounsellorScoreboard,
  type ScoreboardEnrolment,
  type ScoreboardLead,
  type StageInfo,
  type TeamMemberRow,
} from "./scoreboard";

/**
 * The fetch half of the dashboard figures. The arithmetic lives next door
 * in `scoreboard.ts`, where it is pure and tested; this file only gets the
 * rows and computes the Asia/Kolkata boundaries.
 *
 * Everything reads through the RLS-bound client, so no query here filters
 * by centre or by owner for security — `leads` and `enrolments` policies
 * already restrict the rows to the caller's own/centre/all scope. The one
 * place an explicit filter appears is `assigned_to = me`, and that is a
 * *question* ("what is mine?"), not a permission check.
 */

const LEAD_COLUMNS =
  "id, assigned_to, center_id, stage_id, created_at, assigned_at, first_response_at, next_followup_at, sla_breached";

interface LeadRow {
  id: string;
  assigned_to: string | null;
  center_id: string | null;
  stage_id: string | null;
  created_at: string;
  assigned_at: string | null;
  first_response_at: string | null;
  next_followup_at: string | null;
  sla_breached: boolean;
}

interface EnrolmentRow {
  lead_id: string;
  sales_to_accounts_at: string | null;
  dropped_at: string | null;
}

function toLead(row: LeadRow): ScoreboardLead {
  return {
    id: row.id,
    assignedTo: row.assigned_to,
    centerId: row.center_id,
    stageId: row.stage_id,
    createdAt: row.created_at,
    assignedAt: row.assigned_at,
    firstResponseAt: row.first_response_at,
    nextFollowupAt: row.next_followup_at,
    slaBreached: row.sla_breached,
  };
}

function toEnrolment(row: EnrolmentRow): ScoreboardEnrolment {
  return {
    leadId: row.lead_id,
    salesToAccountsAt: row.sales_to_accounts_at,
    droppedAt: row.dropped_at,
  };
}

export function boundariesNow(now = new Date()): Boundaries {
  const startOfMonth = startOfMonthIST(now);
  return {
    startOfToday: startOfDayIST(now),
    startOfTomorrow: startOfTomorrowIST(now),
    startOfMonth,
    // One millisecond before this month began is the last instant of the
    // previous one, whatever its length — no month arithmetic, and right
    // in January.
    startOfPreviousMonth: startOfMonthIST(new Date(startOfMonth.getTime() - 1)),
  };
}

/** How many days the dashboard's own chart covers. */
export const DASHBOARD_DAYS = 30;

async function loadStages(supabase: SupabaseClient): Promise<StageInfo[]> {
  const { data } = await supabase
    .from("pipeline_stages")
    .select("id, stage_type")
    .returns<Array<{ id: string; stage_type: string }>>();
  return (data ?? []).map((row) => ({ id: row.id, stageType: row.stage_type }));
}

export interface MyDashboard {
  scoreboard: CounsellorScoreboard;
  /** One row per day for the last `DASHBOARD_DAYS`, oldest first. */
  series: DailyCount[];
  /** This month's admissions target for this person, or null if nobody set one. */
  admissionsTarget: number | null;
}

/**
 * One person's own figures, their last thirty days, and their target.
 *
 * The enrolment query is deliberately not filtered by lead — fetching the
 * confirmed admissions in the caller's scope is one small query, and
 * `buildCounsellorScoreboard` already ignores any that belong to a lead
 * outside the set it was given. It reaches back to the start of last
 * month rather than this one, because the figure a person reads first is
 * the comparison, and that needs last month's rows.
 */
export async function getMyDashboard(
  supabase: SupabaseClient,
  userId: string,
): Promise<MyDashboard> {
  const boundaries = boundariesNow();
  const days = lastDaysIST(new Date(), DASHBOARD_DAYS);
  // Whichever is earlier: the start of last month, or the start of the
  // chart. One query has to cover both the comparison and the series.
  const since = new Date(
    Math.min(boundaries.startOfPreviousMonth.getTime(), days[0].from.getTime()),
  );

  const [stages, { data: leadRows }, { data: enrolmentRows }, { data: targetRows }] =
    await Promise.all([
      loadStages(supabase),
      supabase
        .from("leads")
        .select(LEAD_COLUMNS)
        .eq("assigned_to", userId)
        .is("deleted_at", null)
        .returns<LeadRow[]>(),
      supabase
        .from("enrolments")
        .select("lead_id, sales_to_accounts_at, dropped_at")
        .is("deleted_at", null)
        .gte("sales_to_accounts_at", since.toISOString())
        .returns<EnrolmentRow[]>(),
      supabase
        .from("targets")
        .select("target_value")
        .eq("owner_id", userId)
        .eq("metric", "admissions")
        .eq("period_month", monthStartDateIST(boundaries.startOfMonth))
        .is("deleted_at", null)
        .returns<Array<{ target_value: number }>>(),
    ]);

  const leads = (leadRows ?? []).map(toLead);
  const enrolments = (enrolmentRows ?? []).map(toEnrolment);

  return {
    scoreboard: buildCounsellorScoreboard({ leads, enrolments, stages, boundaries }),
    series: buildDailySeries({ leads, enrolments, days }),
    admissionsTarget: targetRows?.[0]?.target_value ?? null,
  };
}

/** `targets.period_month` is a date pinned to the 1st, in IST terms. */
function monthStartDateIST(startOfMonth: Date): string {
  return formatDateIST(startOfMonth, "yyyy-MM-dd");
}

export interface CentreViewResult {
  centre: CentreScoreboard;
  /** One row per day for the last `DASHBOARD_DAYS`, oldest first. */
  series: DailyCount[];
  team: TeamMemberRow[];
}

/**
 * The centre head's view: their centre's totals, and a row per counsellor.
 *
 * One pass over the leads for both, because they are the same rows asked
 * two questions. Fetching twice would double the cost of the slowest page
 * in the app for no gain.
 *
 * `members` comes from `profiles`, whose RLS already limits a centre head
 * to the people at their centres. Somebody with an empty pipeline still
 * gets a row — that is the person a head most needs to see.
 */
export async function getCentreView(supabase: SupabaseClient): Promise<CentreViewResult> {
  const boundaries = boundariesNow();
  const days = lastDaysIST(new Date(), DASHBOARD_DAYS);
  const since = new Date(
    Math.min(boundaries.startOfPreviousMonth.getTime(), days[0].from.getTime()),
  );

  const [stages, { data: leadRows }, { data: enrolmentRows }, { data: memberRows }] =
    await Promise.all([
      loadStages(supabase),
      supabase.from("leads").select(LEAD_COLUMNS).is("deleted_at", null).returns<LeadRow[]>(),
      supabase
        .from("enrolments")
        .select("lead_id, sales_to_accounts_at, dropped_at")
        .is("deleted_at", null)
        .gte("sales_to_accounts_at", since.toISOString())
        .returns<EnrolmentRow[]>(),
      supabase
        .from("profiles")
        .select("id, full_name, is_active")
        .eq("is_active", true)
        .returns<Array<{ id: string; full_name: string | null; is_active: boolean }>>(),
    ]);

  const leads = (leadRows ?? []).map(toLead);
  const enrolments = (enrolmentRows ?? []).map(toEnrolment);

  // Only people who actually carry leads, plus anybody holding an active
  // one right now. A centre head's own profile appears when leads are
  // theirs, which is right — they carry a pipeline too — and the finance
  // and academics staff at the same centre do not clutter the table.
  const ownerIds = new Set(leads.map((lead) => lead.assignedTo).filter(Boolean) as string[]);
  const members = (memberRows ?? [])
    .filter((row) => ownerIds.has(row.id))
    .map((row) => ({ userId: row.id, name: row.full_name ?? "Unnamed" }));

  return {
    centre: buildCentreScoreboard({ leads, enrolments, stages, boundaries }),
    series: buildDailySeries({ leads, enrolments, days }),
    team: buildTeamScoreboard({ members, leads, enrolments, stages, boundaries }),
  };
}
