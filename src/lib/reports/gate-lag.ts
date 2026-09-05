/**
 * How long an admission takes to get through the two handover gates.
 *
 * CLAUDE.md names both gates and says the lag between them is "a real
 * operational metric". It has been timestamped on every enrolment since
 * the finance module shipped and measured nowhere.
 *
 *   enquiry ──▶ sales_to_accounts_at ──▶ accounts_to_academics_at
 *              (counsellor confirms)     (first payment clears)
 *
 * Two questions this answers, and they are different questions:
 *
 *  - **How long does it take?** History, for the admissions already
 *    through. Useful for planning and for noticing a centre that has got
 *    slower.
 *  - **Who is stuck right now?** Confirmed admissions that have not paid.
 *    That is not a statistic, it is a list of people somebody should ring
 *    today, and it is the half of this report that earns its place.
 *
 * Pure and tested, because the arithmetic is the sort that looks right
 * and is wrong: an average dragged up by one admission that took eight
 * months tells an institute its handovers are fine when the median says
 * three days and the slow tail says otherwise.
 */

export interface GateRow {
  enrolmentId: string;
  centerName: string | null;
  course: string;
  counsellorName: string | null;
  studentName: string;
  /** The lead's first enquiry — where the clock starts. */
  enquiredAt: string | null;
  salesToAccountsAt: string | null;
  accountsToAcademicsAt: string | null;
  droppedAt: string | null;
}

export interface LagStats {
  count: number;
  medianDays: number;
  meanDays: number;
  /** The slow tail. The number that says whether the median is the whole story. */
  p90Days: number;
  maxDays: number;
}

/** Whole days between two instants, or null if either is missing. Never negative. */
export function daysBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

/**
 * The median, not the mean, is the headline everywhere this is shown.
 *
 * One admission confirmed in March and paid in November drags a mean into
 * uselessness, and an institute reading "average 41 days" concludes its
 * handovers are broken when in fact half of them clear the same week. The
 * mean is still reported, next to the median, because the gap BETWEEN
 * them is itself the interesting signal.
 */
export function lagStats(values: number[]): LagStats | null {
  const sorted = [...values].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;

  return {
    count: sorted.length,
    medianDays: percentile(sorted, 0.5),
    meanDays: Math.round((sorted.reduce((sum, value) => sum + value, 0) / sorted.length) * 10) / 10,
    p90Days: percentile(sorted, 0.9),
    maxDays: sorted[sorted.length - 1],
  };
}

/**
 * Nearest-rank percentile on an already-sorted list.
 *
 * Deliberately not an interpolating one: "the median admission took 4
 * days" should name a real admission that really took 4 days, not 3.5
 * days that nobody experienced.
 */
function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil(fraction * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

export interface StuckRow extends GateRow {
  /** How long they have been sitting past the first gate, unpaid. */
  waitingDays: number;
}

export interface GateSummary {
  /** Enquiry to the counsellor confirming the admission. */
  enquiryToConfirmed: LagStats | null;
  /** The gate lag proper: confirmed to first payment cleared. */
  confirmedToPaid: LagStats | null;
  /** The whole journey, for the admissions that completed it. */
  enquiryToPaid: LagStats | null;
  /** Confirmed, not paid, not dropped — worst wait first. */
  stuck: StuckRow[];
  /** Confirmed admissions that were dropped before ever paying. */
  droppedBeforePaying: number;
}

/**
 * `asOf` rather than `new Date()` so the numbers are reproducible and the
 * tests are not about what today happens to be.
 */
export function summariseGates(rows: GateRow[], asOf: string): GateSummary {
  const enquiryToConfirmed: number[] = [];
  const confirmedToPaid: number[] = [];
  const enquiryToPaid: number[] = [];
  const stuck: StuckRow[] = [];
  let droppedBeforePaying = 0;

  for (const row of rows) {
    if (!row.salesToAccountsAt) continue;

    const toConfirm = daysBetween(row.enquiredAt, row.salesToAccountsAt);
    if (toConfirm !== null) enquiryToConfirmed.push(toConfirm);

    if (row.accountsToAcademicsAt) {
      const toPaid = daysBetween(row.salesToAccountsAt, row.accountsToAcademicsAt);
      if (toPaid !== null) confirmedToPaid.push(toPaid);
      const whole = daysBetween(row.enquiredAt, row.accountsToAcademicsAt);
      if (whole !== null) enquiryToPaid.push(whole);
      continue;
    }

    // Past the first gate, never through the second.
    if (row.droppedAt) {
      // Not stuck — gone. Counted separately, because folding them into
      // the waiting list would have somebody ringing people who left.
      droppedBeforePaying += 1;
      continue;
    }

    const waiting = daysBetween(row.salesToAccountsAt, asOf);
    if (waiting !== null) stuck.push({ ...row, waitingDays: waiting });
  }

  stuck.sort((a, b) => b.waitingDays - a.waitingDays);

  return {
    enquiryToConfirmed: lagStats(enquiryToConfirmed),
    confirmedToPaid: lagStats(confirmedToPaid),
    enquiryToPaid: lagStats(enquiryToPaid),
    stuck,
    droppedBeforePaying,
  };
}

export interface GroupedLag {
  key: string;
  confirmedToPaid: LagStats | null;
  stuck: number;
}

/**
 * The same measure, split by centre or by counsellor.
 *
 * This is where the report becomes actionable: "Kannur's admissions clear
 * in two days and Kochi's in nine" is a question somebody can go and ask.
 */
export function groupGates(
  rows: GateRow[],
  asOf: string,
  by: (row: GateRow) => string | null,
): GroupedLag[] {
  const buckets = new Map<string, GateRow[]>();
  for (const row of rows) {
    const key = by(row) ?? "Unassigned";
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }

  return [...buckets.entries()]
    .map(([key, bucket]) => {
      const summary = summariseGates(bucket, asOf);
      return { key, confirmedToPaid: summary.confirmedToPaid, stuck: summary.stuck.length };
    })
    .sort((a, b) => (b.confirmedToPaid?.medianDays ?? -1) - (a.confirmedToPaid?.medianDays ?? -1));
}

/**
 * How long somebody has been waiting, in words, and how worried to be.
 *
 * The buckets are deliberately coarse. A precise number of days invites
 * an argument about whether 8 is worse than 7; what matters is whether
 * an admission is a few days old or has been sitting for a fortnight.
 */
export function waitBand(days: number): "fresh" | "slipping" | "stale" {
  if (days <= 3) return "fresh";
  if (days <= 14) return "slipping";
  return "stale";
}

export function describeLag(stats: LagStats | null): string {
  if (!stats) return "No data yet";
  const tail =
    stats.p90Days > stats.medianDays * 2 && stats.p90Days - stats.medianDays >= 3
      ? ` — but the slowest tenth take ${stats.p90Days}`
      : "";
  return `${stats.medianDays} day${stats.medianDays === 1 ? "" : "s"}${tail}`;
}
