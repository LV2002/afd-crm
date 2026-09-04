import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { allocatePayments, type ReceivedPayment, type ScheduledInstalment } from "./allocate";
import { getLedgerEntries, type LedgerRow } from "./get-finance";
import {
  ageingBucket,
  categoryBreakdown,
  daysLate,
  monthBounds,
  periodTotals,
  timelinessSummary,
  type TimelinessSummary,
} from "./ledger-math";

/**
 * The workbook's report tabs, rebuilt as queries.
 *
 * Every figure here comes out of the one ledger, exactly as it did in the
 * spreadsheet — that is what stops the Dashboard and the Monthly Report
 * from ever disagreeing. Nothing is cached, nothing is stored twice, and
 * there is no "refresh reports" step because there is nothing to refresh.
 */

export interface PeriodReport {
  incomePaise: number;
  expensePaise: number;
  netPaise: number;
  income: ReturnType<typeof categoryBreakdown>;
  expenses: ReturnType<typeof categoryBreakdown>;
  feesPaise: number;
  feesByAccount: Array<{ accountId: string; accountName: string; totalPaise: number }>;
  feePayments: LedgerRow[];
  entryCount: number;
}

/**
 * One period, broken down the way the Monthly Report does it.
 *
 * The "uncategorised" line in each breakdown is not decoration. Without
 * it, a category renamed in Settings drops its money out of the list while
 * the total below stays correct, and the report quietly disagrees with
 * itself. Here the difference is always on screen.
 */
export async function getPeriodReport(
  supabase: SupabaseClient,
  options: {
    from: string;
    to: string;
    centerId?: string;
    expenseCategories: string[];
    incomeCategories: string[];
    accountNames: Map<string, string>;
  },
): Promise<PeriodReport> {
  const entries = await getLedgerEntries(supabase, {
    from: options.from,
    to: options.to,
    centerId: options.centerId,
  });

  const totals = periodTotals(
    entries.map((e) => ({ direction: e.direction, amountPaise: e.amount_paise })),
  );

  const incomeRows = entries.filter((e) => e.direction === "in");
  const expenseRows = entries.filter((e) => e.direction === "out");

  const feeRows = incomeRows.filter((e) => e.kind === "fee");
  const feesPaise = feeRows.reduce((sum, e) => sum + e.amount_paise, 0);

  const byAccount = new Map<string, number>();
  for (const row of feeRows) {
    byAccount.set(row.account_id, (byAccount.get(row.account_id) ?? 0) + row.amount_paise);
  }

  return {
    incomePaise: totals.inPaise,
    expensePaise: totals.outPaise,
    netPaise: totals.netPaise,
    // Fees are a category of income alongside the admin's own list, which
    // is how the workbook presents it: one INCOME block, "Course Fees"
    // first.
    income: categoryBreakdown(
      incomeRows.map((e) => ({ category: e.category, amountPaise: e.amount_paise })),
      ["Course Fees", ...options.incomeCategories],
    ),
    expenses: categoryBreakdown(
      expenseRows.map((e) => ({ category: e.category, amountPaise: e.amount_paise })),
      options.expenseCategories,
    ),
    feesPaise,
    feesByAccount: [...byAccount.entries()]
      .map(([accountId, totalPaise]) => ({
        accountId,
        accountName: options.accountNames.get(accountId) ?? "Unknown account",
        totalPaise,
      }))
      .sort((a, b) => b.totalPaise - a.totalPaise),
    feePayments: feeRows.slice().sort((a, b) => a.occurred_on.localeCompare(b.occurred_on)),
    entryCount: entries.length,
  };
}

export interface MonthTotals {
  monthKey: string;
  incomePaise: number;
  expensePaise: number;
  netPaise: number;
  byCategory: Map<string, number>;
}

/**
 * A row of months for the cash-flow grid, in one query rather than twelve.
 *
 * The workbook fired a SUMIFS per category per month — 180 of them on one
 * sheet. Fetching the period once and bucketing it in memory is both
 * faster and easier to reason about.
 */
export async function getMonthlySeries(
  supabase: SupabaseClient,
  options: { monthKeys: string[]; centerId?: string },
): Promise<MonthTotals[]> {
  if (options.monthKeys.length === 0) return [];

  const first = monthBounds(options.monthKeys[0]).from;
  const last = monthBounds(options.monthKeys[options.monthKeys.length - 1]).to;

  const entries = await getLedgerEntries(supabase, {
    from: first,
    to: last,
    centerId: options.centerId,
  });

  const buckets = new Map<string, LedgerRow[]>();
  for (const entry of entries) {
    const key = entry.occurred_on.slice(0, 7);
    const list = buckets.get(key) ?? [];
    list.push(entry);
    buckets.set(key, list);
  }

  return options.monthKeys.map((monthKey) => {
    const rows = buckets.get(monthKey) ?? [];
    const totals = periodTotals(
      rows.map((r) => ({ direction: r.direction, amountPaise: r.amount_paise })),
    );
    const byCategory = new Map<string, number>();
    for (const row of rows) {
      // Transfers are excluded here too — a category total that included
      // them would not add up to the column total below it.
      if (row.direction !== "in" && row.direction !== "out") continue;
      byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + row.amount_paise);
    }
    return {
      monthKey,
      incomePaise: totals.inPaise,
      expensePaise: totals.outPaise,
      netPaise: totals.netPaise,
      byCategory,
    };
  });
}

export interface CollectionRow {
  enrolmentId: string;
  studentName: string;
  course: string;
  centerId: string;
  instalmentId: string;
  sequence: number;
  dueDate: string;
  amountPaise: number;
  paidPaise: number;
  outstandingPaise: number;
  status: "paid" | "overdue" | "due_soon" | "upcoming";
  bucket: "current" | "1-30" | "31-60" | "60+";
  daysOverdue: number;
}

export interface CollectionsReport {
  rows: CollectionRow[];
  totalOutstandingPaise: number;
  overduePaise: number;
  byBucket: Record<"current" | "1-30" | "31-60" | "60+", number>;
  timeliness: TimelinessSummary;
  settled: Array<{
    studentName: string;
    course: string;
    dueDate: string;
    settledOn: string;
    daysLate: number;
    amountPaise: number;
  }>;
}

/**
 * What is owed, by whom, and how late — the Collections and Payment
 * Timeliness tabs together.
 *
 * The join the CRM never had: agreed instalments on one side, the
 * append-only payments ledger on the other, matched oldest-first by
 * `allocatePayments()`. Nothing is written; a reversal simply reduces the
 * pot and the instalment it covered goes back to outstanding on its own.
 */
export async function getCollections(
  supabase: SupabaseClient,
  options: { asOf: string; centerId?: string },
): Promise<CollectionsReport> {
  let enrolmentQuery = supabase
    .from("enrolments")
    .select("id, course, center_id, lead_id, student_id, leads(student_name), students(full_name)")
    .is("deleted_at", null);
  if (options.centerId) enrolmentQuery = enrolmentQuery.eq("center_id", options.centerId);

  const [{ data: enrolments }, { data: instalments }, { data: paymentRows }] = await Promise.all([
    enrolmentQuery.returns<
      Array<{
        id: string;
        course: string;
        center_id: string;
        leads: { student_name: string } | null;
        students: { full_name: string } | null;
      }>
    >(),
    supabase
      .from("enrolment_instalments")
      .select("id, enrolment_id, sequence, due_date, amount_paise")
      .returns<
        Array<{
          id: string;
          enrolment_id: string;
          sequence: number;
          due_date: string;
          amount_paise: number;
        }>
      >(),
    supabase
      .from("payments")
      .select("id, enrolment_id, amount_paise, direction, received_at")
      .returns<
        Array<{
          id: string;
          enrolment_id: string;
          amount_paise: number;
          direction: "credit" | "debit";
          received_at: string;
        }>
      >(),
  ]);

  const instalmentsByEnrolment = new Map<string, ScheduledInstalment[]>();
  for (const row of instalments ?? []) {
    const list = instalmentsByEnrolment.get(row.enrolment_id) ?? [];
    list.push({
      id: row.id,
      sequence: row.sequence,
      dueDate: row.due_date,
      amountPaise: row.amount_paise,
    });
    instalmentsByEnrolment.set(row.enrolment_id, list);
  }

  const paymentsByEnrolment = new Map<string, ReceivedPayment[]>();
  for (const row of paymentRows ?? []) {
    const list = paymentsByEnrolment.get(row.enrolment_id) ?? [];
    list.push({
      id: row.id,
      receivedOn: row.received_at.slice(0, 10),
      // A debit is a reversal or refund: negative, so it reduces the pot
      // and un-settles what it had covered, with no special case.
      amountPaise: row.direction === "credit" ? row.amount_paise : -row.amount_paise,
    });
    paymentsByEnrolment.set(row.enrolment_id, list);
  }

  const rows: CollectionRow[] = [];
  const settled: CollectionsReport["settled"] = [];
  const settlements: Array<{ dueDate: string; settledOn: string | null }> = [];

  for (const enrolment of enrolments ?? []) {
    const schedule = instalmentsByEnrolment.get(enrolment.id);
    if (!schedule || schedule.length === 0) continue;

    const studentName = enrolment.students?.full_name ?? enrolment.leads?.student_name ?? "Unknown";
    const result = allocatePayments(
      schedule,
      paymentsByEnrolment.get(enrolment.id) ?? [],
      options.asOf,
    );

    for (const instalment of result.instalments) {
      settlements.push({ dueDate: instalment.dueDate, settledOn: instalment.settledOn });

      if (instalment.settledOn) {
        const late = daysLate({ dueDate: instalment.dueDate, settledOn: instalment.settledOn });
        settled.push({
          studentName,
          course: enrolment.course,
          dueDate: instalment.dueDate,
          settledOn: instalment.settledOn,
          daysLate: late ?? 0,
          amountPaise: instalment.amountPaise,
        });
      }

      if (instalment.outstandingPaise <= 0) continue;

      const bucket = ageingBucket(instalment.dueDate, options.asOf);
      rows.push({
        enrolmentId: enrolment.id,
        studentName,
        course: enrolment.course,
        centerId: enrolment.center_id,
        instalmentId: instalment.id,
        sequence: instalment.sequence,
        dueDate: instalment.dueDate,
        amountPaise: instalment.amountPaise,
        paidPaise: instalment.paidPaise,
        outstandingPaise: instalment.outstandingPaise,
        status: instalment.status,
        bucket,
        daysOverdue: Math.max(
          0,
          Math.floor(
            (Date.parse(`${options.asOf}T00:00:00Z`) - Date.parse(`${instalment.dueDate}T00:00:00Z`)) /
              86_400_000,
          ),
        ),
      });
    }
  }

  rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  settled.sort((a, b) => b.daysLate - a.daysLate);

  const byBucket = { current: 0, "1-30": 0, "31-60": 0, "60+": 0 };
  let totalOutstandingPaise = 0;
  let overduePaise = 0;
  for (const row of rows) {
    byBucket[row.bucket] += row.outstandingPaise;
    totalOutstandingPaise += row.outstandingPaise;
    if (row.status === "overdue") overduePaise += row.outstandingPaise;
  }

  return {
    rows,
    totalOutstandingPaise,
    overduePaise,
    byBucket,
    timeliness: timelinessSummary(settlements),
    settled: settled.slice(0, 200),
  };
}
