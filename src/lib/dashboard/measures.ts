import type { Boundaries, ScoreboardEnrolment, ScoreboardLead } from "./scoreboard";

/**
 * Every figure on the dashboards, as a question the leads list can answer.
 *
 * Leon: *"whenever I click on those tabs, I want you to direct me to the
 * leads page and filter out … only those leads."* A number on a dashboard is
 * only trustworthy if the list behind it has exactly that many rows, so each
 * figure is defined ONCE, here, as a set of criteria — and then used twice:
 *
 *  - `matchesMeasure` applies it to rows in memory, which is how the
 *    dashboard counts (and how the tests prove count and list agree);
 *  - `applyMeasure` applies it to a leads query, which is how the leads page
 *    lists them.
 *
 * Both read the same `criteriaFor`, so they cannot drift apart.
 *
 * ## Whose leads
 *
 * A link carries `for`: one counsellor's uuid, or `all` for everything the
 * viewer may see (RLS still decides what that is — this narrows, it is never
 * the boundary).
 */

export const MEASURE_KEYS = [
  // This month / now
  "active",
  "assigned_today",
  "new_month",
  "responded_month",
  "never_contacted",
  "overdue",
  "due_today",
  "sla_breached",
  "admissions_month",
  "unassigned",
  // Two figures the hero tiles add together, counted without double-counting
  "attention",
  "unowned_or_unanswered",
  // The cycle year to date
  "y_active",
  "y_new",
  "y_contacted",
  "y_never_contacted",
  "y_overdue",
  "y_interested",
  "y_enrolments",
] as const;

export type MeasureKey = (typeof MEASURE_KEYS)[number];

export const MEASURE_LABELS: Record<MeasureKey, string> = {
  active: "Active leads",
  assigned_today: "Assigned today",
  new_month: "New leads this month",
  responded_month: "Answered this month",
  never_contacted: "Never contacted",
  overdue: "Overdue follow-ups",
  due_today: "Follow-ups due today",
  sla_breached: "SLA breached",
  admissions_month: "Admissions this month",
  unassigned: "Unassigned",
  attention: "Follow-ups due (overdue or never answered)",
  unowned_or_unanswered: "Nobody is on these (unassigned or never answered)",
  y_active: "Active leads this year",
  y_new: "New leads this year",
  y_contacted: "Contacted this year",
  y_never_contacted: "Never contacted this year",
  y_overdue: "Overdue follow-ups this year",
  y_interested: "Interested this year",
  y_enrolments: "Enrolments this year",
};

export function parseMeasureKey(value: string | undefined): MeasureKey | null {
  return (MEASURE_KEYS as readonly string[]).includes(value ?? "") ? (value as MeasureKey) : null;
}

/** `for` is a counsellor's id, or `all` for everything the viewer can see. */
export type MeasureOwner = string | "all";

export function measureHref(measure: MeasureKey, owner: MeasureOwner): string {
  const params = new URLSearchParams({ tile: measure, for: owner });
  return `/leads?${params.toString()}`;
}

export interface MeasureContext {
  boundaries: Boundaries;
  /** Temperatures that mean a lead is finished with. */
  terminalTemperatures: ReadonlySet<string>;
  /** Temperatures an admin marked "interested". */
  interestedTemperatures: ReadonlySet<string>;
}

export interface MeasureCriteria {
  /** Not won, not lost. */
  active?: true;
  createdFrom?: Date;
  assignedFrom?: Date;
  assignedTo?: Date;
  /** A follow-up date strictly before this. */
  followupBefore?: Date;
  followupFrom?: Date;
  followupTo?: Date;
  neverContacted?: true;
  responded?: true;
  slaBreached?: true;
  unassigned?: true;
  interested?: true;
  /** Has a live admission confirmed on or after this instant. */
  admittedFrom?: Date;
  /** Either of two conditions, for the hero figures that add two problems together. */
  either?: "attention" | "unowned_or_unanswered";
}

export function criteriaFor(measure: MeasureKey, ctx: MeasureContext): MeasureCriteria {
  const { startOfToday, startOfTomorrow, startOfMonth, startOfCycleYear } = ctx.boundaries;
  switch (measure) {
    case "active":
      return { active: true };
    case "assigned_today":
      return { assignedFrom: startOfToday, assignedTo: startOfTomorrow };
    case "new_month":
      return { createdFrom: startOfMonth };
    case "responded_month":
      return { createdFrom: startOfMonth, responded: true };
    case "never_contacted":
      return { active: true, neverContacted: true };
    case "overdue":
      return { active: true, followupBefore: startOfToday };
    case "due_today":
      return { active: true, followupFrom: startOfToday, followupTo: startOfTomorrow };
    case "sla_breached":
      return { active: true, slaBreached: true };
    case "admissions_month":
      return { admittedFrom: startOfMonth };
    case "unassigned":
      return { active: true, unassigned: true };
    case "attention":
      return { active: true, either: "attention" };
    case "unowned_or_unanswered":
      return { active: true, either: "unowned_or_unanswered" };
    case "y_active":
      return { createdFrom: startOfCycleYear, active: true };
    case "y_new":
      return { createdFrom: startOfCycleYear };
    case "y_contacted":
      return { createdFrom: startOfCycleYear, responded: true };
    case "y_never_contacted":
      return { createdFrom: startOfCycleYear, neverContacted: true };
    case "y_overdue":
      return { createdFrom: startOfCycleYear, active: true, followupBefore: startOfToday };
    case "y_interested":
      return { createdFrom: startOfCycleYear, active: true, interested: true };
    case "y_enrolments":
      return { admittedFrom: startOfCycleYear };
  }
}

function at(value: string | null): number | null {
  return value ? new Date(value).getTime() : null;
}

/** In-memory form of the criteria — what the dashboard counts with. */
export function matchesMeasure(
  measure: MeasureKey,
  lead: ScoreboardLead,
  enrolments: readonly ScoreboardEnrolment[],
  ctx: MeasureContext,
): boolean {
  const c = criteriaFor(measure, ctx);

  if (c.active && lead.temperature && ctx.terminalTemperatures.has(lead.temperature)) return false;

  if (c.createdFrom && new Date(lead.createdAt).getTime() < c.createdFrom.getTime()) return false;

  if (c.assignedFrom || c.assignedTo) {
    const assigned = at(lead.assignedAt);
    if (assigned === null) return false;
    if (c.assignedFrom && assigned < c.assignedFrom.getTime()) return false;
    if (c.assignedTo && assigned >= c.assignedTo.getTime()) return false;
  }

  if (c.followupBefore || c.followupFrom || c.followupTo) {
    const due = at(lead.nextFollowupAt);
    if (due === null) return false;
    if (c.followupBefore && due >= c.followupBefore.getTime()) return false;
    if (c.followupFrom && due < c.followupFrom.getTime()) return false;
    if (c.followupTo && due >= c.followupTo.getTime()) return false;
  }

  if (c.neverContacted && lead.firstResponseAt !== null) return false;
  if (c.responded && lead.firstResponseAt === null) return false;
  if (c.slaBreached && !lead.slaBreached) return false;
  if (c.unassigned && lead.assignedTo) return false;
  if (c.interested && !(lead.temperature && ctx.interestedTemperatures.has(lead.temperature))) {
    return false;
  }

  if (c.admittedFrom) {
    const from = c.admittedFrom.getTime();
    const admitted = enrolments.some((enrolment) => {
      const confirmed = at(enrolment.salesToAccountsAt);
      return (
        enrolment.leadId === lead.id && !enrolment.droppedAt && confirmed !== null && confirmed >= from
      );
    });
    if (!admitted) return false;
  }

  if (c.either === "attention") {
    const due = at(lead.nextFollowupAt);
    const overdue = due !== null && due < ctx.boundaries.startOfToday.getTime();
    if (!(overdue || lead.firstResponseAt === null)) return false;
  }
  if (c.either === "unowned_or_unanswered") {
    if (!(lead.assignedTo === null || lead.firstResponseAt === null)) return false;
  }

  return true;
}

/** True for the measures that need a join to enrolments. */
export function needsEnrolments(measure: MeasureKey): boolean {
  return criteriaFor(measure, EMPTY_CONTEXT).admittedFrom !== undefined;
}

const EMPTY_CONTEXT: MeasureContext = {
  boundaries: {
    startOfToday: new Date(0),
    startOfTomorrow: new Date(0),
    startOfMonth: new Date(0),
    startOfPreviousMonth: new Date(0),
    startOfCycleYear: new Date(0),
  },
  terminalTemperatures: new Set(),
  interestedTemperatures: new Set(),
};

/**
 * A leads query, as much of the PostgREST builder as the criteria need.
 * Typed structurally, like the other `apply…` helpers, so it works on the
 * RLS-bound builder without importing it.
 */
interface MeasureQuery {
  gte(column: string, value: string): this;
  lt(column: string, value: string): this;
  is(column: string, value: null): this;
  not(column: string, operator: string, value: null): this;
  eq(column: string, value: boolean): this;
  in(column: string, values: string[]): this;
  or(filters: string): this;
}

/**
 * Database form of the same criteria — what the leads page lists with.
 *
 * `unfinished` is `unfinishedLeadsFilter(terminal)` (the page already builds
 * it for the follow-up lists); passed in so this file stays free of the
 * temperature loader.
 *
 * Admission measures filter on the embedded `enrolments` rows, which the
 * caller must have joined with `enrolments!inner(...)` — see
 * `needsEnrolments`.
 */
export function applyMeasure<Q extends MeasureQuery>(
  query: Q,
  measure: MeasureKey,
  ctx: MeasureContext,
  unfinished: string | null,
): Q {
  const c = criteriaFor(measure, ctx);
  let next = query;

  if (c.active && unfinished) next = next.or(unfinished);
  if (c.createdFrom) next = next.gte("created_at", c.createdFrom.toISOString());
  if (c.assignedFrom) next = next.gte("assigned_at", c.assignedFrom.toISOString());
  if (c.assignedTo) next = next.lt("assigned_at", c.assignedTo.toISOString());
  if (c.followupBefore) next = next.lt("next_followup_at", c.followupBefore.toISOString());
  if (c.followupFrom) next = next.gte("next_followup_at", c.followupFrom.toISOString());
  if (c.followupTo) next = next.lt("next_followup_at", c.followupTo.toISOString());
  if (c.neverContacted) next = next.is("first_response_at", null);
  if (c.responded) next = next.not("first_response_at", "is", null);
  if (c.slaBreached) next = next.eq("sla_breached", true);
  if (c.unassigned) next = next.is("assigned_to", null);
  if (c.interested) next = next.in("temperature", [...ctx.interestedTemperatures]);
  if (c.admittedFrom) {
    next = next.gte("enrolments.sales_to_accounts_at", c.admittedFrom.toISOString());
    next = next.is("enrolments.dropped_at", null);
  }
  if (c.either === "attention") {
    next = next.or(
      `first_response_at.is.null,next_followup_at.lt.${ctx.boundaries.startOfToday.toISOString()}`,
    );
  }
  if (c.either === "unowned_or_unanswered") {
    next = next.or("assigned_to.is.null,first_response_at.is.null");
  }
  return next;
}
