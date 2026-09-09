/**
 * Conversion by any one thing about a lead — their district, their
 * school, their board.
 *
 * The Insights pivot can already group leads by these, but it counts
 * them; it does not tell you which segments CONVERT. "Kannur sends us
 * forty leads and nine become students; Kozhikode sends us thirty-five
 * and two" is a marketing decision, and it was not answerable.
 */

export interface SegmentLead {
  leadId: string;
  /** The value being grouped on. Null and blank both land in "Not recorded". */
  value: string | null;
  admitted: boolean;
}

export interface SegmentRow {
  value: string;
  leads: number;
  admissions: number;
  /** Null when the segment is too small to draw a conclusion from. See MIN_FOR_RATE. */
  conversionRate: number | null;
  /** 0–1, this segment's leads as a share of the largest segment's. For the bars. */
  intensity: number;
}

export const NOT_RECORDED = "Not recorded";

/**
 * Below this many leads, a conversion rate is noise wearing a percentage
 * sign.
 *
 * One admission out of two is "50%", and somebody will move budget on it.
 * Reporting null and showing the raw counts instead is the honest answer,
 * and it is the difference between a report that informs a decision and
 * one that misleads it.
 */
export const MIN_FOR_RATE = 8;

export function segmentPerformance(leads: SegmentLead[]): SegmentRow[] {
  const grouped = new Map<string, { leads: number; admissions: number }>();

  for (const lead of leads) {
    const key = lead.value?.trim() || NOT_RECORDED;
    const entry = grouped.get(key) ?? { leads: 0, admissions: 0 };
    entry.leads += 1;
    if (lead.admitted) entry.admissions += 1;
    grouped.set(key, entry);
  }

  const largest = Math.max(1, ...[...grouped.values()].map((entry) => entry.leads));

  return [...grouped.entries()]
    .map(([value, entry]) => ({
      value,
      leads: entry.leads,
      admissions: entry.admissions,
      conversionRate: entry.leads >= MIN_FOR_RATE ? entry.admissions / entry.leads : null,
      intensity: entry.leads / largest,
    }))
    .sort((a, b) => b.leads - a.leads || a.value.localeCompare(b.value));
}

/**
 * The segments worth acting on: enough volume to be real, and a rate
 * meaningfully above or below the overall one.
 */
export function standoutSegments(
  rows: SegmentRow[],
  overallRate: number,
): { best: SegmentRow[]; worst: SegmentRow[] } {
  const measurable = rows.filter((row) => row.conversionRate !== null);
  // Half again, or half — a difference small enough to be sampling noise
  // is not a finding, however large the table looks.
  const best = measurable
    .filter((row) => row.conversionRate! >= overallRate * 1.5)
    .sort((a, b) => b.conversionRate! - a.conversionRate!)
    .slice(0, 5);
  const worst = measurable
    .filter((row) => row.conversionRate! <= overallRate * 0.5)
    .sort((a, b) => a.conversionRate! - b.conversionRate!)
    .slice(0, 5);
  return { best, worst };
}

export function overallRate(rows: SegmentRow[]): number {
  const leads = rows.reduce((sum, row) => sum + row.leads, 0);
  const admissions = rows.reduce((sum, row) => sum + row.admissions, 0);
  return leads === 0 ? 0 : admissions / leads;
}
