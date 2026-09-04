import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatINR } from "@/lib/format/currency";
import {
  getAccountsWithBalances,
  getFinanceCategories,
  getFinanceConfig,
  getLedgerEntries,
} from "@/lib/finance/get-finance";
import { gstComponent } from "@/lib/finance/ledger-math";
import { getPeriodReport } from "@/lib/finance/reports";
import { createClient } from "@/lib/supabase/server";

/**
 * Yearly Metrics: how this year compares with the last few, where the fee
 * revenue came from by course, where it went by category, and the GST memo.
 *
 * The GST figure is back-calculated OUT of gross collections — the money
 * received is the gross, so the tax inside it is gross × r / (1 + r), not
 * gross × r. It is a memo and nothing more: not a return, no input credit,
 * no record of what has been remitted. The workbook said exactly that, and
 * it stays true here.
 */
export default async function YearlyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year: yearParam } = await searchParams;
  const year = Number(yearParam) || new Date().getFullYear();

  const supabase = await createClient();
  const [config, categories, accounts] = await Promise.all([
    getFinanceConfig(supabase),
    getFinanceCategories(supabase),
    getAccountsWithBalances(supabase, { includeInactive: true }),
  ]);

  const accountNames = new Map(accounts.map((a) => [a.id, a.name]));
  const expenseCategories = categories.expense.map((c) => c.label);
  const incomeCategories = categories.income.map((c) => c.label);

  const years = [year - 2, year - 1, year];
  const [reports, feeEntries] = await Promise.all([
    Promise.all(
      years.map((y) =>
        getPeriodReport(supabase, {
          from: `${y}-01-01`,
          to: `${y}-12-31`,
          expenseCategories,
          incomeCategories,
          accountNames,
        }),
      ),
    ),
    getLedgerEntries(supabase, { from: `${year}-01-01`, to: `${year}-12-31`, kind: "fee" }),
  ]);

  const current = reports[reports.length - 1];

  const byCourse = new Map<string, number>();
  for (const entry of feeEntries) {
    const key = entry.course ?? "Not attributed to a course";
    byCourse.set(key, (byCourse.get(key) ?? 0) + entry.amount_paise);
  }
  const courseRows = [...byCourse.entries()].sort((a, b) => b[1] - a[1]);

  const gstPaise = gstComponent(current.feesPaise, config.gstRate);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/finance/reports/year?year=${year - 1}`} className="underline">
          ← {year - 1}
        </Link>
        <span className="font-semibold">{year}</span>
        <Link href={`/finance/reports/year?year=${year + 1}`} className="underline">
          {year + 1} →
        </Link>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Year on year
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              {years.map((y) => (
                <TableHead key={y} className="text-right">
                  {y}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <YearRow label="Total income" values={reports.map((r) => r.incomePaise)} />
            <YearRow label="Total expenses" values={reports.map((r) => r.expensePaise)} />
            <YearRow label="Course fees" values={reports.map((r) => r.feesPaise)} />
            <YearRow label="Net" values={reports.map((r) => r.netPaise)} emphasis />
          </TableBody>
        </Table>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Fee revenue by course — cash received in {year}
        </h2>
        {courseRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fee payments recorded this year.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {courseRows.map(([course, totalPaise]) => (
                <TableRow key={course}>
                  <TableCell>{course}</TableCell>
                  <TableCell className="text-right">{formatINR(totalPaise)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {current.feesPaise === 0
                      ? "—"
                      : `${Math.round((totalPaise / current.feesPaise) * 100)}%`}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold">Total course fees</TableCell>
                <TableCell className="text-right font-semibold">
                  {formatINR(current.feesPaise)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Expenses by category
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Share</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {current.expenses.rows
              .filter((row) => row.totalPaise !== 0)
              .sort((a, b) => b.totalPaise - a.totalPaise)
              .map((row) => (
                <TableRow key={row.category}>
                  <TableCell>{row.category}</TableCell>
                  <TableCell className="text-right">{formatINR(row.totalPaise)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {current.expensePaise === 0
                      ? "—"
                      : `${Math.round((row.totalPaise / current.expensePaise) * 100)}%`}
                  </TableCell>
                </TableRow>
              ))}
            {current.expenses.uncategorisedPaise !== 0 && (
              <TableRow>
                <TableCell className="italic text-muted-foreground">
                  Other / uncategorised
                </TableCell>
                <TableCell className="text-right italic">
                  {formatINR(current.expenses.uncategorisedPaise)}
                </TableCell>
                <TableCell />
              </TableRow>
            )}
            <TableRow>
              <TableCell className="font-semibold">Total expenses</TableCell>
              <TableCell className="text-right font-semibold">
                {formatINR(current.expensePaise)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          GST memo — confirm the treatment with your CA
        </h2>
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Gross fee collections</TableCell>
              <TableCell className="text-right">{formatINR(current.feesPaise)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>
                Indicative GST component at {(config.gstRate * 100).toFixed(2)}%
              </TableCell>
              <TableCell className="text-right">{formatINR(gstPaise)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-semibold">Indicative net of GST</TableCell>
              <TableCell className="text-right font-semibold">
                {formatINR(current.feesPaise - gstPaise)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">
          A memo only. It back-calculates the GST already inside gross collections. It is not a
          return, and it tracks neither input credit nor what has actually been remitted.
        </p>
      </section>
    </div>
  );
}

function YearRow({
  label,
  values,
  emphasis,
}: {
  label: string;
  values: number[];
  emphasis?: boolean;
}) {
  return (
    <TableRow className={emphasis ? "bg-muted/50" : undefined}>
      <TableCell className="font-medium">{label}</TableCell>
      {values.map((value, i) => (
        <TableCell
          key={i}
          className={
            value < 0 ? "text-right font-semibold text-destructive" : "text-right font-semibold"
          }
        >
          {formatINR(value)}
        </TableCell>
      ))}
    </TableRow>
  );
}
