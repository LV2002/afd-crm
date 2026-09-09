/**
 * Which sources start conversations, and which ones finish them.
 *
 * Every lead carries both a first-touch source (where they came from
 * originally, never overwritten) and a last-touch source (the most recent
 * one before they converted). Both have been stored since the identity
 * layer shipped and neither has ever been compared to the other — so the
 * question "does Instagram bring people in and the website close them, or
 * the other way round?" has had no answer.
 *
 * It matters for where the money goes. A source credited only on last
 * touch looks worthless if its job is to introduce people; a source
 * credited only on first touch looks worthless if its job is to bring
 * them back. Budgets get cut on exactly that misreading.
 */

export interface AttributionLead {
  leadId: string;
  firstTouchSource: string | null;
  lastTouchSource: string | null;
  /** True once they are past the sales→accounts gate and not dropped. */
  admitted: boolean;
}

export interface SourceAttribution {
  source: string;
  /** Leads this source brought in for the first time. */
  firstTouchLeads: number;
  /** Leads whose most recent source was this one. */
  lastTouchLeads: number;
  firstTouchAdmissions: number;
  lastTouchAdmissions: number;
  /**
   * Positive when the source introduces more people than it closes;
   * negative when it closes more than it introduces.
   *
   * This single number is the point of the report: it separates the
   * sources doing the opening from the sources doing the closing, and
   * both get cut for the wrong reason when only one column is looked at.
   */
  introducerScore: number;
}

const UNKNOWN = "Unknown";

export function compareTouch(leads: AttributionLead[]): SourceAttribution[] {
  const rows = new Map<string, SourceAttribution>();

  function row(source: string): SourceAttribution {
    const existing = rows.get(source);
    if (existing) return existing;
    const created: SourceAttribution = {
      source,
      firstTouchLeads: 0,
      lastTouchLeads: 0,
      firstTouchAdmissions: 0,
      lastTouchAdmissions: 0,
      introducerScore: 0,
    };
    rows.set(source, created);
    return created;
  }

  for (const lead of leads) {
    const first = lead.firstTouchSource?.trim() || UNKNOWN;
    const last = lead.lastTouchSource?.trim() || first;

    const firstRow = row(first);
    firstRow.firstTouchLeads += 1;
    if (lead.admitted) firstRow.firstTouchAdmissions += 1;

    const lastRow = row(last);
    lastRow.lastTouchLeads += 1;
    if (lead.admitted) lastRow.lastTouchAdmissions += 1;
  }

  for (const entry of rows.values()) {
    entry.introducerScore = entry.firstTouchAdmissions - entry.lastTouchAdmissions;
  }

  return [...rows.values()].sort(
    (a, b) =>
      b.firstTouchAdmissions +
        b.lastTouchAdmissions -
        (a.firstTouchAdmissions + a.lastTouchAdmissions) || b.firstTouchLeads - a.firstTouchLeads,
  );
}

/**
 * How the two views differ overall.
 *
 * A source whose two columns match is doing the same job at both ends. A
 * large gap in either direction is the finding.
 */
export function describeRole(row: SourceAttribution): "introducer" | "closer" | "balanced" {
  const total = row.firstTouchAdmissions + row.lastTouchAdmissions;
  if (total === 0) return "balanced";
  // A tenth of the admissions is the smallest gap worth calling a
  // difference; below that it is noise on AFD's monthly volume.
  const threshold = Math.max(1, Math.round(total * 0.1));
  if (row.introducerScore >= threshold) return "introducer";
  if (row.introducerScore <= -threshold) return "closer";
  return "balanced";
}

/** Leads whose journey started and ended somewhere different. The share worth reading the rest for. */
export function multiTouchShare(leads: AttributionLead[]): number {
  if (leads.length === 0) return 0;
  const moved = leads.filter(
    (lead) =>
      lead.lastTouchSource &&
      lead.firstTouchSource &&
      lead.lastTouchSource.trim() !== lead.firstTouchSource.trim(),
  ).length;
  return moved / leads.length;
}
