/**
 * How long people take to decide, by the month they arrived.
 *
 * A single conversion rate hides the thing an institute most needs to
 * know: whether this month's intake is genuinely worse or simply younger.
 * Leads arriving in the exam-results rush convert in days; leads arriving
 * in January are still thinking in March. Compared as flat percentages,
 * the recent cohort always looks like a disaster.
 *
 * A cohort curve fixes that by comparing like with like — everyone at
 * fourteen days, everyone at thirty — and by refusing to report a number
 * a cohort has not lived long enough to have.
 */

export interface CohortLead {
  leadId: string;
  /** `yyyy-MM-dd`, the day they first enquired. */
  arrivedOn: string;
  /** `yyyy-MM-dd` of the sales→accounts gate, or null. */
  admittedOn: string | null;
}

/** The checkpoints. Chosen against a coaching institute's real decision cycle, not round numbers. */
export const COHORT_DAYS = [7, 14, 30, 60, 90] as const;
export type CohortDay = (typeof COHORT_DAYS)[number];

export interface CohortRow {
  /** `yyyy-MM` — the month they arrived. */
  cohort: string;
  size: number;
  /**
   * Cumulative conversion at each checkpoint. **Null means the cohort is
   * not old enough to know**, which is a different statement from zero
   * and the whole reason this report can be trusted.
   */
  rates: Record<CohortDay, number | null>;
  /** Admissions so far, whatever their age. */
  admitted: number;
}

function daysBetween(from: string, to: string): number {
  return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * `asOf` rather than `new Date()` so the table is reproducible and the
 * tests are not about what today happens to be.
 */
export function cohortCurves(leads: CohortLead[], asOf: string): CohortRow[] {
  const byMonth = new Map<string, CohortLead[]>();
  for (const lead of leads) {
    const month = lead.arrivedOn.slice(0, 7);
    const bucket = byMonth.get(month);
    if (bucket) bucket.push(lead);
    else byMonth.set(month, [lead]);
  }

  const rows: CohortRow[] = [];

  for (const [cohort, members] of byMonth) {
    // Measured from the LAST day of the month, not the first: a cohort is
    // only fully N days old when its newest member is, and measuring from
    // the first day reports a 30-day rate for people who have had eleven.
    const lastArrival = members.reduce(
      (latest, lead) => (lead.arrivedOn > latest ? lead.arrivedOn : latest),
      members[0].arrivedOn,
    );
    const age = daysBetween(lastArrival, asOf);

    const rates = {} as Record<CohortDay, number | null>;
    for (const day of COHORT_DAYS) {
      if (age < day) {
        rates[day] = null;
        continue;
      }
      const converted = members.filter(
        (lead) => lead.admittedOn && daysBetween(lead.arrivedOn, lead.admittedOn) <= day,
      ).length;
      rates[day] = members.length === 0 ? 0 : converted / members.length;
    }

    rows.push({
      cohort,
      size: members.length,
      rates,
      admitted: members.filter((lead) => lead.admittedOn).length,
    });
  }

  return rows.sort((a, b) => b.cohort.localeCompare(a.cohort));
}

/**
 * Where the decisions actually happen — the share of all admissions that
 * closed within each window.
 *
 * This is what a follow-up cadence should be built around. If four in
 * five admissions close inside thirty days, chasing a lead at day sixty
 * is a different job from chasing one at day ten.
 */
export function decisionWindow(leads: CohortLead[]): Array<{ day: CohortDay; share: number }> {
  const admitted = leads.filter((lead) => lead.admittedOn);
  if (admitted.length === 0) return COHORT_DAYS.map((day) => ({ day, share: 0 }));

  return COHORT_DAYS.map((day) => ({
    day,
    share:
      admitted.filter((lead) => daysBetween(lead.arrivedOn, lead.admittedOn!) <= day).length /
      admitted.length,
  }));
}
