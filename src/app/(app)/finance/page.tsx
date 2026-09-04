import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "@/lib/finance/get-finance";
import { monthBounds } from "@/lib/finance/ledger-math";
import { getCollections, getMonthlySeries, getPeriodReport } from "@/lib/finance/reports";
import { createClient } from "@/lib/supabase/server";

/**
 * The Dashboard tab: where the money is, and how the month is going.
 *
 * Same four questions the workbook's Dashboard answered — cash by account,
 * income and expenses this month and this year, what students still owe,
 * and where the money is going — read from the one ledger, so it can never
 * disagree with the reports behind it.
 */
export default async function FinanceDashboardPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  const thisYear = today.slice(0, 4);

  const [accounts, categories, config] = await Promise.all([
    getAccountsWithBalances(supabase),
    getFinanceCategories(supabase),
    getFinanceConfig(supabase),
  ]);

  const accountNames = new Map(accounts.map((a) => [a.id, a.name]));
  const bounds = monthBounds(thisMonth);

  const [month, year, collections, trend] = await Promise.all([
    getPeriodReport(supabase, {
      from: bounds.from,
      to: bounds.to,
      expenseCategories: categories.expense.map((c) => c.label),
      incomeCategories: categories.income.map((c) => c.label),
      accountNames,
    }),
    getPeriodReport(supabase, {
      from: `${thisYear}-01-01`,
      to: `${thisYear}-12-31`,
      expenseCategories: categories.expense.map((c) => c.label),
      incomeCategories: categories.income.map((c) => c.label),
      accountNames,
    }),
    getCollections(supabase, { asOf: today }),
    getMonthlySeries(supabase, { monthKeys: lastSixMonths(today) }),
  ]);

  const totalCashPaise = accounts.reduce((sum, a) => sum + a.balancePaise, 0);
  const topExpenses = [...year.expenses.rows]
    .filter((row) => row.totalPaise > 0)
    .sort((a, b) => b.totalPaise - a.totalPaise)
    .slice(0, 6);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Cash position
          </h2>
          <p className="text-sm text-muted-foreground">
            Total cash{" "}
            <span className="text-lg font-semibold text-foreground">
              {formatINR(totalCashPaise)}
            </span>
          </p>
        </div>

        {accounts.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No accounts yet.{" "}
            <Link href="/finance/accounts" className="font-medium underline">
              Add your bank, cash and petty cash accounts
            </Link>{" "}
            and set their opening balances.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Centre</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>
                    <Link
                      href={`/finance/ledger?account=${account.id}`}
                      className="font-medium hover:underline"
                    >
                      {account.name}
                    </Link>
                    {account.needsTopUp && (
                      <Badge variant="outline" className="ml-2 gap-1">
                        <AlertTriangle className="size-3" /> Low float
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{account.centerName}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {account.type.replace("_", " ")}
                  </TableCell>
                  <TableCell
                    className={
                      account.balancePaise < 0
                        ? "text-right font-semibold text-destructive"
                        : "text-right font-semibold"
                    }
                  >
                    {formatINR(account.balancePaise)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Income this month" value={formatINR(month.incomePaise)} tone="good" />
        <Stat label="Expenses this month" value={formatINR(month.expensePaise)} tone="bad" />
        <Stat
          label="Net this month"
          value={formatINR(month.netPaise)}
          tone={month.netPaise >= 0 ? "good" : "bad"}
        />
        <Stat label="Income this year" value={formatINR(year.incomePaise)} />
        <Stat label="Expenses this year" value={formatINR(year.expensePaise)} />
        <Stat
          label="Net this year"
          value={formatINR(year.netPaise)}
          tone={year.netPaise >= 0 ? "good" : "bad"}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Students &amp; outstanding</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Line label="Total outstanding" value={formatINR(collections.totalOutstandingPaise)} />
            <Line label="Overdue right now" value={formatINR(collections.overduePaise)} emphasis />
            <Line label="Scheduled payments still owed" value={String(collections.rows.length)} />
            <Line
              label="Paid on time"
              value={
                collections.timeliness.onTimeRate === null
                  ? "—"
                  : `${Math.round(collections.timeliness.onTimeRate * 100)}%`
              }
            />
            <Link href="/finance/collections" className="mt-1 text-sm font-medium underline">
              Open collections
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top expenses this year</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {topExpenses.length === 0 ? (
              <p className="text-muted-foreground">Nothing recorded yet this year.</p>
            ) : (
              topExpenses.map((row) => (
                <Line key={row.category} label={row.category} value={formatINR(row.totalPaise)} />
              ))
            )}
            {year.expenses.uncategorisedPaise !== 0 && (
              <Line
                label="Other / uncategorised"
                value={formatINR(year.expenses.uncategorisedPaise)}
              />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Six-month trend
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Income</TableHead>
              <TableHead className="text-right">Expenses</TableHead>
              <TableHead className="text-right">Net</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trend.map((row) => (
              <TableRow key={row.monthKey}>
                <TableCell className="font-medium">{formatMonth(row.monthKey)}</TableCell>
                <TableCell className="text-right">{formatINR(row.incomePaise)}</TableCell>
                <TableCell className="text-right">{formatINR(row.expensePaise)}</TableCell>
                <TableCell
                  className={
                    row.netPaise < 0
                      ? "text-right font-semibold text-destructive"
                      : "text-right font-semibold"
                  }
                >
                  {formatINR(row.netPaise)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <p className="text-xs text-muted-foreground">
        GST is taken as {(config.gstRate * 100).toFixed(2)}% — set in Settings → Organisation.
        Transfers between your own accounts are deliberately left out of income and expenses.
      </p>
    </div>
  );
}

function lastSixMonths(today: string): string[] {
  const [year, month] = today.slice(0, 7).split("-").map(Number);
  const keys: string[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={
          tone === "bad"
            ? "mt-1 text-xl font-semibold text-destructive"
            : "mt-1 text-xl font-semibold"
        }
      >
        {value}
      </p>
    </div>
  );
}

function Line({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={emphasis ? "font-semibold text-destructive" : "font-medium"}>{value}</span>
    </div>
  );
}
