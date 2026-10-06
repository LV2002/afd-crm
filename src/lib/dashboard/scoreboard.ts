/**
 * The numbers on a counsellor's own screen, and on a centre head's view of
 * their team.
 *
 * Pure: rows in, figures out. No database, no clock — "today" and "this
 * month" arrive as boundaries the caller computed in Asia/Kolkata, because
 * a month boundary is a timezone question and this file should not be
 * guessing at one.
 *
 * ## Two honesty rules that shape the whole module
 *
 * **The conversion figure is a running rate, not a cohort conversion.**
 * Admissions confirmed this month came mostly from leads that arrived last
 * month or the one before. Dividing one by the other is the number every
 * sales floor quotes, and it is useful for spotting a bad month — but it
 * is not "x% of my leads convert". `cohortConversion` in the insights
 * module answers that properly. The field here is named
 * `admissionsPerLeadThisMonth` so nobody reads it as the other thing.
 *
 * **A zero denominator yields null, never zero.** A counsellor who got no
 * leads this month has an undefined ratio, not a 0% one, and a screen
 * showing "0%" next to their name is an accusation the data does not
 * support.
 */

export interface ScoreboardLead {
  id: string;
  assignedTo: string | null;
  centerId: string | null;
  stageId: string | null;
  createdAt: string;
  /** Set by a database trigger whenever the owner changes. Null for never-assigned. */
  assignedAt: string | null;
  firstResponseAt: string | null;
  nextFollowupAt: string | null;
  slaBreached: boolean;
}

export interface ScoreboardEnrolment {
  leadId: string;
  /** Gate 1 — the counsellor confirmed the admission. Null means not yet confirmed. */
  salesToAccountsAt: string | null;
  droppedAt: string | null;
}

/** Terminal stages need no daily attention and are excluded from "active". */
export interface StageInfo {
  id: string;
  stageType: string;
}

export interface Boundaries {
  /** Start of today, Asia/Kolkata, as an instant. */
  startOfToday: Date;
  /** Start of tomorrow, so "today" is a half-open range. */
  startOfTomorrow: Date;
  /** Start of the current month, Asia/Kolkata. */
  startOfMonth: Date;
  /**
   * Start of the month before it — so this month has something to be
   * compared against. A number on its own says nothing: 7 admissions is
   * a good month or a bad one depending on what last month was, and the
   * person reading the dashboard should not have to remember.
   */
  startOfPreviousMonth: Date;
}

export interface CounsellorScoreboard {
  /** Not won, not lost, not deleted. The pile they are actually working. */
  activeLeads: number;
  /** Handed to them today, whether new or reassigned. */
  assignedToday: number;
  /** Arrived this month and is theirs now. */
  newThisMonth: number;
  /** Theirs, active, and never once responded to. The most actionable number here. */
  neverContacted: number;
  /** A follow-up date that has passed. */
  overdueFollowups: number;
  /** A follow-up falling today. */
  dueToday: number;
  /** Active leads the SLA sweep has flagged. */
  slaBreached: number;
  /** Admissions confirmed this month on leads they own. */
  admissionsThisMonth: number;
  /**
   * admissionsThisMonth / newThisMonth, as a percentage rounded to one
   * decimal. Null when they had no new leads this month — see the header.
   */
  admissionsPerLeadThisMonth: number | null;
  /** How many of this month's leads they answered at all, for a response-rate read. */
  respondedThisMonth: number;
  /** The same two figures for the whole of last month, for the comparison. */
  newLastMonth: number;
  admissionsLastMonth: number;
}

function isActive(lead: ScoreboardLead, terminalStageIds: Set<string>): boolean {
  return !lead.stageId || !terminalStageIds.has(lead.stageId);
}

function within(value: string | null, from: Date, to: Date): boolean {
  if (!value) return false;
  const at = new Date(value).getTime();
  return at >= from.getTime() && at < to.getTime();
}

function onOrAfter(value: string | null, from: Date): boolean {
  if (!value) return false;
  return new Date(value).getTime() >= from.getTime();
}

/** Percentage to one decimal, or null when there is nothing to divide by. */
export function ratePercent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function terminalStageIdsOf(stages: readonly StageInfo[]): Set<string> {
  return new Set(
    stages.filter((s) => s.stageType === "won" || s.stageType === "lost").map((s) => s.id),
  );
}

/**
 * One person's figures. `leads` should already be only their leads —
 * filtering here too would hide a caller's mistake rather than fix it.
 */
export function buildCounsellorScoreboard(input: {
  leads: readonly ScoreboardLead[];
  enrolments: readonly ScoreboardEnrolment[];
  stages: readonly StageInfo[];
  boundaries: Boundaries;
}): CounsellorScoreboard {
  const { startOfToday, startOfTomorrow, startOfMonth, startOfPreviousMonth } = input.boundaries;
  const terminal = terminalStageIdsOf(input.stages);

  const active = input.leads.filter((lead) => isActive(lead, terminal));
  const leadIds = new Set(input.leads.map((lead) => lead.id));

  const newThisMonth = input.leads.filter((lead) =>
    onOrAfter(lead.createdAt, startOfMonth),
  ).length;

  const admissionsThisMonth = input.enrolments.filter(
    (enrolment) =>
      leadIds.has(enrolment.leadId) &&
      !enrolment.droppedAt &&
      onOrAfter(enrolment.salesToAccountsAt, startOfMonth),
  ).length;

  const newLastMonth = input.leads.filter((lead) =>
    within(lead.createdAt, startOfPreviousMonth, startOfMonth),
  ).length;

  const admissionsLastMonth = input.enrolments.filter(
    (enrolment) =>
      leadIds.has(enrolment.leadId) &&
      !enrolment.droppedAt &&
      within(enrolment.salesToAccountsAt, startOfPreviousMonth, startOfMonth),
  ).length;

  return {
    activeLeads: active.length,
    assignedToday: input.leads.filter((lead) =>
      within(lead.assignedAt, startOfToday, startOfTomorrow),
    ).length,
    newThisMonth,
    neverContacted: active.filter((lead) => !lead.firstResponseAt).length,
    overdueFollowups: active.filter(
      (lead) =>
        lead.nextFollowupAt && new Date(lead.nextFollowupAt).getTime() < startOfToday.getTime(),
    ).length,
    dueToday: active.filter((lead) =>
      within(lead.nextFollowupAt, startOfToday, startOfTomorrow),
    ).length,
    slaBreached: active.filter((lead) => lead.slaBreached).length,
    admissionsThisMonth,
    admissionsPerLeadThisMonth: ratePercent(admissionsThisMonth, newThisMonth),
    respondedThisMonth: input.leads.filter(
      (lead) => onOrAfter(lead.createdAt, startOfMonth) && lead.firstResponseAt !== null,
    ).length,
    newLastMonth,
    admissionsLastMonth,
  };
}

export interface DailyCount {
  /** `yyyy-MM-dd`, IST. */
  date: string;
  leads: number;
  admissions: number;
}

/**
 * Leads and admissions per day, for the sparklines and the 30-day chart.
 *
 * The day windows are passed in, like the boundaries, because which
 * instant a day starts at is a timezone question and this file does not
 * answer those. A day with nothing in it is still a row with a zero: a
 * line chart that silently skips empty days draws a busy month out of a
 * quiet one.
 */
export function buildDailySeries(input: {
  leads: readonly ScoreboardLead[];
  enrolments: readonly ScoreboardEnrolment[];
  days: ReadonlyArray<{ date: string; from: Date; to: Date }>;
}): DailyCount[] {
  const leadIds = new Set(input.leads.map((lead) => lead.id));
  const admissions = input.enrolments.filter(
    (enrolment) => leadIds.has(enrolment.leadId) && !enrolment.droppedAt,
  );

  return input.days.map((day) => ({
    date: day.date,
    leads: input.leads.filter((lead) => within(lead.createdAt, day.from, day.to)).length,
    admissions: admissions.filter((enrolment) =>
      within(enrolment.salesToAccountsAt, day.from, day.to),
    ).length,
  }));
}

export interface TeamMemberRow {
  userId: string;
  name: string;
  scoreboard: CounsellorScoreboard;
}

/**
 * The same figures, one row per counsellor, for a centre head.
 *
 * `members` is passed in rather than derived from the leads, so somebody
 * with an empty pipeline still appears. A team table that silently drops
 * the person with no leads this month hides exactly the case a centre head
 * most needs to see.
 *
 * Sorted by admissions, then active leads, then name: the ordering a head
 * actually scans, with the alphabetical tiebreak keeping it stable between
 * refreshes.
 */
export function buildTeamScoreboard(input: {
  members: ReadonlyArray<{ userId: string; name: string }>;
  leads: readonly ScoreboardLead[];
  enrolments: readonly ScoreboardEnrolment[];
  stages: readonly StageInfo[];
  boundaries: Boundaries;
}): TeamMemberRow[] {
  const leadsByOwner = new Map<string, ScoreboardLead[]>();
  for (const lead of input.leads) {
    if (!lead.assignedTo) continue;
    const list = leadsByOwner.get(lead.assignedTo);
    if (list) list.push(lead);
    else leadsByOwner.set(lead.assignedTo, [lead]);
  }

  return input.members
    .map((member) => ({
      userId: member.userId,
      name: member.name,
      scoreboard: buildCounsellorScoreboard({
        leads: leadsByOwner.get(member.userId) ?? [],
        enrolments: input.enrolments,
        stages: input.stages,
        boundaries: input.boundaries,
      }),
    }))
    .sort((a, b) => {
      if (a.scoreboard.admissionsThisMonth !== b.scoreboard.admissionsThisMonth) {
        return b.scoreboard.admissionsThisMonth - a.scoreboard.admissionsThisMonth;
      }
      if (a.scoreboard.activeLeads !== b.scoreboard.activeLeads) {
        return b.scoreboard.activeLeads - a.scoreboard.activeLeads;
      }
      return a.name.localeCompare(b.name);
    });
}

/**
 * The centre's own totals — the team's rows added up, plus the things that
 * belong to nobody.
 *
 * `unassigned` cannot come from summing the team: a lead with no owner
 * appears in no member's row, which is precisely why it needs saying out
 * loud here.
 */
export interface CentreScoreboard {
  activeLeads: number;
  unassigned: number;
  newThisMonth: number;
  admissionsThisMonth: number;
  admissionsPerLeadThisMonth: number | null;
  slaBreached: number;
  neverContacted: number;
  overdueFollowups: number;
  /** Last month's intake and admissions, for the same comparison a counsellor gets. */
  newLastMonth: number;
  admissionsLastMonth: number;
}

export function buildCentreScoreboard(input: {
  leads: readonly ScoreboardLead[];
  enrolments: readonly ScoreboardEnrolment[];
  stages: readonly StageInfo[];
  boundaries: Boundaries;
}): CentreScoreboard {
  // Every lead in scope, owned or not — so this is the whole-centre view,
  // not the sum of the people in it.
  const whole = buildCounsellorScoreboard(input);
  const terminal = terminalStageIdsOf(input.stages);

  return {
    activeLeads: whole.activeLeads,
    unassigned: input.leads.filter((lead) => !lead.assignedTo && isActive(lead, terminal)).length,
    newThisMonth: whole.newThisMonth,
    admissionsThisMonth: whole.admissionsThisMonth,
    admissionsPerLeadThisMonth: whole.admissionsPerLeadThisMonth,
    slaBreached: whole.slaBreached,
    neverContacted: whole.neverContacted,
    overdueFollowups: whole.overdueFollowups,
    newLastMonth: whole.newLastMonth,
    admissionsLastMonth: whole.admissionsLastMonth,
  };
}
