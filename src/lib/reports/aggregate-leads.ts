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

import type { TemperatureKind } from "@/lib/leads/temperature-kinds";

export interface ReportLead {
  id: string;
  assignedTo: string | null;
  centerId: string | null;
  /** The lead's status — its temperature value. */
  temperature: string | null;
  firstTouchSource: string | null;
}

/** One temperature, as the reports need to know it. */
export interface StatusInfo {
  value: string;
  label: string;
  rank: number;
  kind: TemperatureKind;
}

export interface SourceCount {
  source: string;
  count: number;
}

export interface StatusCount {
  value: string;
  name: string;
  count: number;
  kind: TemperatureKind;
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

/**
 * Where every lead stands, status by status, in the order an admin put the
 * statuses in.
 *
 * Every status appears even with zero leads — a status nobody is in right
 * now is still real information. This replaces the pipeline funnel: with
 * one status there is no longer a sequence a lead moves down, so it is a
 * breakdown rather than a funnel, and is named for what it is.
 */
export function aggregateByStatus(leads: ReportLead[], statuses: StatusInfo[]): StatusCount[] {
  const counts = new Map<string, number>();
  for (const lead of leads) {
    if (!lead.temperature) continue;
    counts.set(lead.temperature, (counts.get(lead.temperature) ?? 0) + 1);
  }
  return [...statuses]
    .sort((a, b) => a.rank - b.rank)
    .map((status) => ({
      value: status.value,
      name: status.label,
      kind: status.kind,
      count: counts.get(status.value) ?? 0,
    }));
}

/** Leads with no owner (`assignedTo` null — the orphan queue's territory, Phase 2) are excluded: there's no counsellor to score. */
export function aggregateScorecard(
  leads: ReportLead[],
  statuses: StatusInfo[],
  nameById: ReadonlyMap<string, string>,
): ScorecardRow[] {
  const kindByValue = new Map(statuses.map((s) => [s.value, s.kind]));
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
    const kind = lead.temperature ? kindByValue.get(lead.temperature) : undefined;
    if (kind === "won") row.won += 1;
    if (kind === "lost") row.lost += 1;
    rows.set(lead.assignedTo, row);
  }

  return Array.from(rows.values()).sort((a, b) => b.total - a.total);
}

/** Leads with no centre are excluded — same reasoning as the scorecard's unowned leads. */
export function aggregateCentrePerformance(
  leads: ReportLead[],
  statuses: StatusInfo[],
  nameById: ReadonlyMap<string, string>,
): CentreRow[] {
  const kindByValue = new Map(statuses.map((s) => [s.value, s.kind]));
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
    const kind = lead.temperature ? kindByValue.get(lead.temperature) : undefined;
    if (kind === "won") row.won += 1;
    if (kind === "lost") row.lost += 1;
    rows.set(lead.centerId, row);
  }

  return Array.from(rows.values()).sort((a, b) => b.total - a.total);
}
