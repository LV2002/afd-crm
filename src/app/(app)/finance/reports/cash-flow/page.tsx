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
import { getFinanceCategories, getFinanceConfig } from "@/lib/finance/get-finance";
import { fiscalMonths } from "@/lib/finance/ledger-math";
import { getMonthlySeries } from "@/lib/finance/reports";
import { createClient } from "@/lib/supabase/server";

/**
 * Twelve months across, categories down — the Cash Flow tab.
 *
 * The year runs from the fiscal-year start month in Settings, so for AFD
 * it is April to March rather than January to December. That is not a
 * display preference: a year that does not match the one the accounts are
 * filed on is a year nobody can use.
 *
 * The workbook fired a SUMIFS per category per month — around 180 formulas
 * on one sheet, recalculated on every edit. This is one query for the
 * period, bucketed in memory.
 */
export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const supabase = await createClient();
  const [config, categories] = await Promise.all([
    getFinanceConfig(supabase),
    getFinanceCategories(supabase),
  ]);

  const { year: yearParam } = await searchParams;
  const now = new Date();
  // Before the FY start month, "this year" is still the one that began
  // last calendar year — otherwise January shows an empty grid.
  const defaultYear =
    now.getMonth() + 1 >= config.fiscalYearStartMonth
      ? now.getFullYear()
      : now.getFullYear() - 1;
  const year = Number(yearParam) || defaultYear;

  const monthKeys = fiscalMonths(year, config.fiscalYearStartMonth);
  const series = await getMonthlySeries(supabase, { monthKeys });

  const incomeCategories = ["Course Fees", ...categories.income.map((c) => c.label)];
  const expenseCategories = categories.expense.map((c) => c.label);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/finance/reports/cash-flow?year=${year - 1}`} className="underline">
          ← {year - 1}
        </Link>
        <span className="font-semibold">
          FY {year}
          {config.fiscalYearStartMonth === 1 ? "" : `–${String((year + 1) % 100).padStart(2, "0")}`}
        </span>
        <Link href={`/finance/reports/cash-flow?year=${year + 1}`} className="underline">
          {year + 1} →
        </Link>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-52">Category</TableHead>
              {monthKeys.map((key) => (
                <TableHead key={key} className="text-right">
                  {shortMonth(key)}
                </TableHead>
              ))}
              <TableHead className="text-right font-semibold">Year</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <BandRow label="Income" span={monthKeys.length + 2} />
            {incomeCategories.map((category) => (
              <CategoryRow key={`in-${category}`} label={category} series={series} category={category} />
            ))}
            <UncategorisedRow
              series={series}
              known={incomeCategories}
              pick={(m) => m.incomePaise}
              label="Other / uncategorised income"
            />
            <TotalRow label="Total income" series={series} pick={(m) => m.incomePaise} />

            <BandRow label="Expenses" span={monthKeys.length + 2} />
            {expenseCategories.map((category) => (
              <CategoryRow key={`out-${category}`} label={category} series={series} category={category} />
            ))}
            <UncategorisedRow
              series={series}
              known={expenseCategories}
              pick={(m) => m.expensePaise}
              label="Other / uncategorised expenses"
            />
            <TotalRow label="Total expenses" series={series} pick={(m) => m.expensePaise} />

            <TotalRow label="Net cash flow" series={series} pick={(m) => m.netPaise} emphasis />
            <CumulativeRow series={series} />
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Transfers between your own accounts are excluded from both halves — moving money from the
        bank to the cash box is not income and not an expense.
      </p>
    </div>
  );
}

type Series = Awaited<ReturnType<typeof getMonthlySeries>>;

function shortMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", {
    month: "short",
    timeZone: "UTC",
  });
}

function BandRow({ label, span }: { label: string; span: number }) {
  return (
    <TableRow>
      <TableCell colSpan={span} className="bg-muted font-semibold">
        {label}
      </TableCell>
    </TableRow>
  );
}

function CategoryRow({
  label,
  category,
  series,
}: {
  label: string;
  category: string;
  series: Series;
}) {
  const values = series.map((m) => m.byCategory.get(category) ?? 0);
  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  return (
    <TableRow>
      <TableCell className="text-sm">{label}</TableCell>
      {values.map((value, i) => (
        <TableCell key={i} className="text-right text-sm">
          {value === 0 ? "" : formatINR(value)}
        </TableCell>
      ))}
      <TableCell className="text-right text-sm font-semibold">{formatINR(total)}</TableCell>
    </TableRow>
  );
}

function UncategorisedRow({
  series,
  known,
  pick,
  label,
}: {
  series: Series;
  known: string[];
  pick: (month: Series[number]) => number;
  label: string;
}) {
  const values = series.map((month) => {
    const accounted = known.reduce((sum, c) => sum + (month.byCategory.get(c) ?? 0), 0);
    return pick(month) - accounted;
  });
  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  return (
    <TableRow>
      <TableCell className="text-sm italic text-muted-foreground">{label}</TableCell>
      {values.map((value, i) => (
        <TableCell key={i} className="text-right text-sm italic">
          {value === 0 ? "" : formatINR(value)}
        </TableCell>
      ))}
      <TableCell className="text-right text-sm italic font-semibold">{formatINR(total)}</TableCell>
    </TableRow>
  );
}

function TotalRow({
  label,
  series,
  pick,
  emphasis,
}: {
  label: string;
  series: Series;
  pick: (month: Series[number]) => number;
  emphasis?: boolean;
}) {
  const values = series.map(pick);
  const total = values.reduce((a, b) => a + b, 0);

  return (
    <TableRow className={emphasis ? "bg-muted/50" : undefined}>
      <TableCell className="font-semibold">{label}</TableCell>
      {values.map((value, i) => (
        <TableCell
          key={i}
          className={value < 0 ? "text-right font-semibold text-destructive" : "text-right font-semibold"}
        >
          {value === 0 ? "" : formatINR(value)}
        </TableCell>
      ))}
      <TableCell
        className={total < 0 ? "text-right font-semibold text-destructive" : "text-right font-semibold"}
      >
        {formatINR(total)}
      </TableCell>
    </TableRow>
  );
}

function CumulativeRow({ series }: { series: Series }) {
  let running = 0;
  const values = series.map((month) => {
    running += month.netPaise;
    return running;
  });

  return (
    <TableRow>
      <TableCell className="text-sm text-muted-foreground">Cumulative</TableCell>
      {values.map((value, i) => (
        <TableCell
          key={i}
          className={value < 0 ? "text-right text-sm text-destructive" : "text-right text-sm"}
        >
          {formatINR(value)}
        </TableCell>
      ))}
      <TableCell />
    </TableRow>
  );
}
