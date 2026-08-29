/**
 * docs/02-BUILD-PHASES.md § Phase 2: "Prebuilt dashboards: leads by
 * source, funnel, counsellor scorecard, centre performance." Pure
 * aggregation over an already-scoped, already-fetched lead list — the
 * page component does the fetching and scope filtering (report.read's
 * own own/center/all scope, not lead.read's — see docs/DECISIONS.md for
 * why those are deliberately different checks here), this just counts.
 *
 * Scoped down from Phase 2's full "generic pivot widget" ambition (nine
 * dimensions over an arbitrary date range) to a first real pass: a
 * present-moment snapshot, not yet date-range-filterable. See
 * docs/DECISIONS.md.
 */

export interface ReportLead {
  id: string;
  assignedTo: string | null;
  centerId: string | null;
  stageId: string | null;
  firstTouchSource: string | null;
}

export interface StageInfo {
  id: string;
  name: string;
  sortOrder: number;
  stageType: string;
}

export interface SourceCount {
  source: string;
  count: number;
}

export interface FunnelStage {
  stageId: string;
  name: string;
  count: number;
  stageType: string;
}

export interface ScorecardRow {
  ownerId: string;
  name: string;
  total: number;
  won: number;
  lost: number;
}

export interface CentreRow {
  centerId: string;
  name: string;
  total: number;
  won: number;
  lost: number;
}

const UNKNOWN_SOURCE = "Unknown";

export function aggregateLeadsBySource(leads: ReportLead[]): SourceCount[] {
  const counts = new Map<string, number>();
  for (const lead of leads) {
    const source = lead.firstTouchSource ?? UNKNOWN_SOURCE;
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }
  return Array.from(counts, ([source, count]) => ({ source, count })).sort(
    (a, b) => b.count - a.count,
  );
}

/** Every active stage appears, even with zero leads — a stage nobody's in right now is still real information for a funnel. */
export function aggregateFunnel(leads: ReportLead[], stages: StageInfo[]): FunnelStage[] {
  const counts = new Map<string, number>();
  for (const lead of leads) {
    if (!lead.stageId) continue;
    counts.set(lead.stageId, (counts.get(lead.stageId) ?? 0) + 1);
  }
  return [...stages]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((stage) => ({
      stageId: stage.id,
      name: stage.name,
      stageType: stage.stageType,
      count: counts.get(stage.id) ?? 0,
    }));
}

function isWon(stageType: string): boolean {
  return stageType === "won";
}
function isLost(stageType: string): boolean {
  return stageType === "lost";
}

/** Leads with no owner (`assignedTo` null — the orphan queue's territory, Phase 2) are excluded: there's no counsellor to score. */
export function aggregateScorecard(
  leads: ReportLead[],
  stages: StageInfo[],
  nameById: ReadonlyMap<string, string>,
): ScorecardRow[] {
  const stageTypeById = new Map(stages.map((s) => [s.id, s.stageType]));
  const rows = new Map<string, ScorecardRow>();

  for (const lead of leads) {
    if (!lead.assignedTo) continue;
    const row = rows.get(lead.assignedTo) ?? {
      ownerId: lead.assignedTo,
      name: nameById.get(lead.assignedTo) ?? "Unknown",
      total: 0,
      won: 0,
      lost: 0,
    };
    row.total += 1;
    const stageType = lead.stageId ? stageTypeById.get(lead.stageId) : undefined;
    if (stageType && isWon(stageType)) row.won += 1;
    if (stageType && isLost(stageType)) row.lost += 1;
    rows.set(lead.assignedTo, row);
  }

  return Array.from(rows.values()).sort((a, b) => b.total - a.total);
}

/** Leads with no centre are excluded — same reasoning as the scorecard's unowned leads. */
export function aggregateCentrePerformance(
  leads: ReportLead[],
  stages: StageInfo[],
  nameById: ReadonlyMap<string, string>,
): CentreRow[] {
  const stageTypeById = new Map(stages.map((s) => [s.id, s.stageType]));
  const rows = new Map<string, CentreRow>();

  for (const lead of leads) {
    if (!lead.centerId) continue;
    const row = rows.get(lead.centerId) ?? {
      centerId: lead.centerId,
      name: nameById.get(lead.centerId) ?? "Unknown",
      total: 0,
      won: 0,
      lost: 0,
    };
    row.total += 1;
    const stageType = lead.stageId ? stageTypeById.get(lead.stageId) : undefined;
    if (stageType && isWon(stageType)) row.won += 1;
    if (stageType && isLost(stageType)) row.lost += 1;
    rows.set(lead.centerId, row);
  }

  return Array.from(rows.values()).sort((a, b) => b.total - a.total);
}
