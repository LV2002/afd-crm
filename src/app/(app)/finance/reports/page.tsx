import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateIST } from "@/lib/format/date";
import { formatINR } from "@/lib/format/currency";
import {
  getAccountsWithBalances,
  getFinanceCategories,
} from "@/lib/finance/get-finance";
import { monthBounds } from "@/lib/finance/ledger-math";
import { getPeriodReport } from "@/lib/finance/reports";
import { createClient } from "@/lib/supabase/server";

import { MonthPicker } from "./month-picker";

/**
 * The Monthly Report, tab for tab: income by category, expenses by
 * category with each one's share, the net, then course fees split by the
 * account they landed in and a line-by-line list of who paid.
 *
 * Each breakdown carries an "other / uncategorised" line. It looks like
 * pedantry until the month a category is renamed, at which point it is the
 * only thing standing between a tidy-looking report and a wrong one.
 */
export default async function MonthlyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const monthKey = /^\d{4}-\d{2}$/.test(month ?? "")
    ? month!
    : new Date().toISOString().slice(0, 7);
  const bounds = monthBounds(monthKey);

  const supabase = await createClient();
  const [accounts, categories] = await Promise.all([
    getAccountsWithBalances(supabase, { includeInactive: true }),
    getFinanceCategories(supabase),
  ]);

  const report = await getPeriodReport(supabase, {
    from: bounds.from,
    to: bounds.to,
    expenseCategories: categories.expense.map((c) => c.label),
    incomeCategories: categories.income.map((c) => c.label),
    accountNames: new Map(accounts.map((a) => [a.id, a.name])),
  });

  return (
    <div className="flex flex-col gap-6">
      <MonthPicker monthKey={monthKey} />

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Income" value={formatINR(report.incomePaise)} />
        <Stat label="Expenses" value={formatINR(report.expensePaise)} />
        <Stat
          label="Net"
          value={formatINR(report.netPaise)}
          negative={report.netPaise < 0}
        />
      </section>

      <BreakdownTable
        title="Income"
        rows={report.income.rows}
        uncategorisedPaise={report.income.uncategorisedPaise}
        totalPaise={report.incomePaise}
      />

      <BreakdownTable
        title="Expenses"
        rows={report.expenses.rows}
        uncategorisedPaise={report.expenses.uncategorisedPaise}
        totalPaise={report.expensePaise}
        showShare
      />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Course fees this month, by account
        </h2>
        {report.feesByAccount.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fee payments this month.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Received into</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.feesByAccount.map((row) => (
                <TableRow key={row.accountId}>
                  <TableCell>{row.accountName}</TableCell>
                  <TableCell className="text-right">{formatINR(row.totalPaise)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {report.feesPaise === 0
                      ? "—"
                      : `${Math.round((row.totalPaise / report.feesPaise) * 100)}%`}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold">Total course fees</TableCell>
                <TableCell className="text-right font-semibold">
                  {formatINR(report.feesPaise)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Who paid this month
        </h2>
        <p className="text-sm text-muted-foreground">
          Every fee payment in date order. A reversal appears as a negative row, so this list always
          adds up to the total above.
        </p>
        {report.feePayments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Received into</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.feePayments.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {formatDateIST(`${row.occurred_on}T00:00:00Z`, "d MMM yyyy")}
                  </TableCell>
                  <TableCell>{row.student_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{row.course ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {accounts.find((a) => a.id === row.account_id)?.name ?? "—"}
                  </TableCell>
                  <TableCell
                    className={
                      row.amount_paise < 0
                        ? "text-right font-semibold text-destructive"
                        : "text-right font-semibold"
                    }
                  >
                    {formatINR(row.amount_paise)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
  uncategorisedPaise,
  totalPaise,
  showShare,
}: {
  title: string;
  rows: Array<{ category: string; totalPaise: number }>;
  uncategorisedPaise: number;
  totalPaise: number;
  showShare?: boolean;
}) {
  const shown = rows.filter((row) => row.totalPaise !== 0);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            {showShare && <TableHead className="text-right">Share</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((row) => (
            <TableRow key={row.category}>
              <TableCell>{row.category}</TableCell>
              <TableCell className="text-right">{formatINR(row.totalPaise)}</TableCell>
              {showShare && (
                <TableCell className="text-right text-muted-foreground">
                  {totalPaise === 0 ? "—" : `${Math.round((row.totalPaise / totalPaise) * 100)}%`}
                </TableCell>
              )}
            </TableRow>
          ))}
          {uncategorisedPaise !== 0 && (
            <TableRow>
              <TableCell className="italic text-muted-foreground">
                Other / uncategorised
              </TableCell>
              <TableCell className="text-right italic">{formatINR(uncategorisedPaise)}</TableCell>
              {showShare && <TableCell />}
            </TableRow>
          )}
          <TableRow>
            <TableCell className="font-semibold">Total {title.toLowerCase()}</TableCell>
            <TableCell className="text-right font-semibold">{formatINR(totalPaise)}</TableCell>
            {showShare && <TableCell />}
          </TableRow>
        </TableBody>
      </Table>
    </section>
  );
}

function Stat({
  label,
  value,
  negative,
}: {
  label: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={negative ? "mt-1 text-xl font-semibold text-destructive" : "mt-1 text-xl font-semibold"}>
        {value}
      </p>
    </div>
  );
}
