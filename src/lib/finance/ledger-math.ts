/**
 * The arithmetic behind the finance module, with no database in it.
 *
 * This is the part that must not be wrong: a balance that is out by a
 * rupee is a balance nobody trusts, and an institute that stops trusting
 * its own ledger goes back to the spreadsheet. Everything here is integer
 * paise (CLAUDE.md § Conventions), so the sums are exact.
 */

export type FinanceDirection = "in" | "out" | "transfer_in" | "transfer_out";
export type FinanceKind = "fee" | "other_income" | "expense" | "transfer";

export interface LedgerEntry {
  direction: FinanceDirection;
  amountPaise: number;
}

/**
 * What one entry does to the account it sits on: money in is positive,
 * money out negative. A reversal carries a negative `amountPaise`, so its
 * effect flips automatically and the pair cancels — which is the whole
 * reason reversals are stored this way rather than as a status flag.
 */
export function signedAmount(entry: LedgerEntry): number {
  const inbound = entry.direction === "in" || entry.direction === "transfer_in";
  return inbound ? entry.amountPaise : -entry.amountPaise;
}

/** Opening balance plus everything the ledger says. Never a stored counter. */
export function accountBalance(openingPaise: number, entries: LedgerEntry[]): number {
  return entries.reduce((sum, entry) => sum + signedAmount(entry), openingPaise);
}

/**
 * A running balance down a statement, oldest first — the Account Ledger's
 * right-hand column. Returned alongside each entry rather than computed in
 * the view, so the same numbers can be tested and exported.
 */
export function runningBalances(openingPaise: number, entries: LedgerEntry[]): number[] {
  let balance = openingPaise;
  return entries.map((entry) => {
    balance += signedAmount(entry);
    return balance;
  });
}

export interface PeriodTotals {
  inPaise: number;
  outPaise: number;
  netPaise: number;
}

/**
 * Income, expenses and net for a set of entries.
 *
 * Transfers are excluded from BOTH sides, which is the single most
 * important rule in the whole module. Moving ₹50,000 from the bank to the
 * cash box is not ₹50,000 of income and it is not ₹50,000 of expense — it
 * is the same money in a different drawer. Counting it would inflate both
 * halves of every report and make the profit figure meaningless.
 */
export function periodTotals(entries: LedgerEntry[]): PeriodTotals {
  let inPaise = 0;
  let outPaise = 0;
  for (const entry of entries) {
    if (entry.direction === "in") inPaise += entry.amountPaise;
    else if (entry.direction === "out") outPaise += entry.amountPaise;
    // transfer_in / transfer_out: deliberately neither.
  }
  return { inPaise, outPaise, netPaise: inPaise - outPaise };
}

/**
 * GST already inside a gross collection, at the given rate.
 *
 * Back-calculated, not added on: the money received IS the gross, so the
 * tax component is gross × r / (1 + r), not gross × r. Getting this
 * backwards overstates the liability by the rate squared, which at 18% is
 * a 3% error on a number a CA will look at.
 *
 * A memo only. It is not a return, and it tracks neither input credit nor
 * what has actually been remitted — the workbook says the same in the same
 * words, and it stays true here.
 */
export function gstComponent(grossPaise: number, rate: number): number {
  if (!(rate > 0)) return 0;
  return Math.round((grossPaise * rate) / (1 + rate));
}

/**
 * The twelve months of a financial year that starts in `startMonth`
 * (1 = January, 4 = the Indian April–March year), as `YYYY-MM` keys.
 *
 * `year` names the year the FY STARTS in, so FY 2026 with an April start
 * runs 2026-04 to 2027-03.
 */
export function fiscalMonths(year: number, startMonth: number): string[] {
  const months: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    const monthIndex = startMonth - 1 + i;
    const y = year + Math.floor(monthIndex / 12);
    const m = (monthIndex % 12) + 1;
    months.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return months;
}

/** First and last day of a `YYYY-MM` key, as `YYYY-MM-DD`. */
export function monthBounds(monthKey: string): { from: string; to: string } {
  const [year, month] = monthKey.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${monthKey}-01`,
    to: `${monthKey}-${String(lastDay).padStart(2, "0")}`,
  };
}

/** The `YYYY-MM` a `YYYY-MM-DD` falls in. */
export function monthKeyOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export interface CategoryTotal {
  category: string;
  totalPaise: number;
}

/**
 * Totals by category, plus the reconciling "uncategorised" line the
 * workbook was careful to include.
 *
 * That line is the point: without it, a category renamed or deleted in
 * Settings would quietly drop its money out of the breakdown while the
 * total below stayed right, and the report would disagree with itself with
 * nothing on screen to say so. Here the difference is always shown.
 */
export function categoryBreakdown(
  entries: Array<{ category: string; amountPaise: number }>,
  knownCategories: string[],
): { rows: CategoryTotal[]; uncategorisedPaise: number; totalPaise: number } {
  const byCategory = new Map<string, number>();
  let totalPaise = 0;

  for (const entry of entries) {
    byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + entry.amountPaise);
    totalPaise += entry.amountPaise;
  }

  const rows = knownCategories.map((category) => ({
    category,
    totalPaise: byCategory.get(category) ?? 0,
  }));
  const accounted = rows.reduce((sum, row) => sum + row.totalPaise, 0);

  return { rows, uncategorisedPaise: totalPaise - accounted, totalPaise };
}

/**
 * Whether a petty cash box needs topping up: below a fifth of its float,
 * the threshold the workbook used.
 */
export function isPettyCashLow(balancePaise: number, floatPaise: number | null): boolean {
  if (!floatPaise || floatPaise <= 0) return false;
  return balancePaise < floatPaise * 0.2;
}

export interface InstalmentSettlement {
  dueDate: string;
  /** Null while still unpaid. */
  settledOn: string | null;
}

/**
 * Days late, per the workbook: zero when settled on or before the due
 * date, never negative. Paying early is on time, not credit to be carried.
 */
export function daysLate(settlement: InstalmentSettlement): number | null {
  if (!settlement.settledOn) return null;
  const due = Date.parse(`${settlement.dueDate}T00:00:00Z`);
  const paid = Date.parse(`${settlement.settledOn}T00:00:00Z`);
  if (Number.isNaN(due) || Number.isNaN(paid)) return null;
  return Math.max(0, Math.round((paid - due) / 86_400_000));
}

export interface TimelinessSummary {
  settled: number;
  onTime: number;
  late: number;
  onTimeRate: number | null;
  averageDaysLate: number | null;
  worstDaysLate: number | null;
}

export function timelinessSummary(settlements: InstalmentSettlement[]): TimelinessSummary {
  const lateness = settlements
    .map(daysLate)
    .filter((d): d is number => d !== null);

  const late = lateness.filter((d) => d > 0);
  return {
    settled: lateness.length,
    onTime: lateness.length - late.length,
    late: late.length,
    // Null rather than 0 when nothing has settled: "0% on time" and
    // "nothing has been paid yet" are different facts and should not
    // render the same.
    onTimeRate: lateness.length === 0 ? null : (lateness.length - late.length) / lateness.length,
    // Averaged over the LATE ones only, as the workbook does — averaging
    // in every on-time zero flatters the number into meaninglessness.
    averageDaysLate: late.length === 0 ? null : late.reduce((a, b) => a + b, 0) / late.length,
    worstDaysLate: lateness.length === 0 ? null : Math.max(...lateness),
  };
}

/**
 * Ageing buckets for what is still owed, by how overdue it is.
 *
 * Not in the workbook, and the one thing it was missing: "Collections Due"
 * sorted by date tells you what is late but not how bad it is getting.
 */
export function ageingBucket(dueDate: string, asOf: string): "current" | "1-30" | "31-60" | "60+" {
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  const now = Date.parse(`${asOf}T00:00:00Z`);
  const days = Math.floor((now - due) / 86_400_000);
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  return "60+";
}
