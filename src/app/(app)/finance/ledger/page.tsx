import Link from "next/link";

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
import { getAccountsWithBalances, getLedgerEntries, reversedIds } from "@/lib/finance/get-finance";
import { runningBalances, signedAmount } from "@/lib/finance/ledger-math";
import { createClient } from "@/lib/supabase/server";

/**
 * One account's statement, with a running balance.
 *
 * Oldest first, because a running balance only means anything read
 * downwards. The final figure is checked against the account's own
 * computed balance and says so on screen — the workbook had the same
 * "✅ reconciles" check, and it is worth keeping: it is the one place a
 * mistake in the arithmetic would show itself.
 */
export default async function AccountLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; from?: string; to?: string }>;
}) {
  const { account: accountId, from, to } = await searchParams;
  const supabase = await createClient();
  const accounts = await getAccountsWithBalances(supabase, { includeInactive: true });

  const selected = accounts.find((a) => a.id === accountId) ?? accounts[0];

  if (!selected) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No accounts yet — add one under Accounts first.
      </p>
    );
  }

  const entries = await getLedgerEntries(supabase, { accountId: selected.id, from, to });
  const reversed = reversedIds(entries);

  // The opening figure for THIS view. With no date filter it is the
  // account's own opening balance; filtered, the statement starts partway
  // through and the running balance would otherwise be meaningless.
  const filtered = Boolean(from || to);
  const balances = runningBalances(
    filtered ? 0 : selected.opening_balance_paise,
    entries.map((e) => ({ direction: e.direction, amountPaise: e.amount_paise })),
  );
  const closing = balances.length > 0 ? balances[balances.length - 1] : selected.opening_balance_paise;
  const reconciles = filtered || closing === selected.balancePaise;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {accounts.map((account) => (
          <Link
            key={account.id}
            href={`/finance/ledger?account=${account.id}`}
            className={
              account.id === selected.id
                ? "rounded-md bg-secondary px-3 py-1.5 text-sm font-medium"
                : "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/50"
            }
          >
            {account.name}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-lg border p-4 text-sm">
        <span>
          <span className="text-muted-foreground">Opening </span>
          <span className="font-semibold">{formatINR(selected.opening_balance_paise)}</span>
        </span>
        <span>
          <span className="text-muted-foreground">Balance now </span>
          <span className="font-semibold">{formatINR(selected.balancePaise)}</span>
        </span>
        <span>
          <span className="text-muted-foreground">Entries </span>
          <span className="font-semibold">{entries.length}</span>
        </span>
        <span className={reconciles ? "text-muted-foreground" : "font-semibold text-destructive"}>
          {filtered
            ? "Filtered view — running balance starts at zero"
            : reconciles
              ? "Reconciles"
              : "Does not reconcile — check with an admin"}
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nothing on this account yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">In</TableHead>
                <TableHead className="text-right">Out</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry, index) => {
                const signed = signedAmount({
                  direction: entry.direction,
                  amountPaise: entry.amount_paise,
                });
                const isReversed = reversed.has(entry.id);
                return (
                  <TableRow key={entry.id} className={isReversed ? "opacity-50" : undefined}>
                    <TableCell className="text-muted-foreground">{entry.txn_no}</TableCell>
                    <TableCell>{formatDateIST(`${entry.occurred_on}T00:00:00Z`, "d MMM yyyy")}</TableCell>
                    <TableCell className={isReversed ? "line-through" : undefined}>
                      {entry.description}
                      {entry.reference && (
                        <span className="ml-2 text-xs text-muted-foreground">{entry.reference}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{entry.category}</TableCell>
                    <TableCell className="text-right">
                      {signed > 0 ? formatINR(signed) : ""}
                    </TableCell>
                    <TableCell className="text-right">
                      {signed < 0 ? formatINR(-signed) : ""}
                    </TableCell>
                    <TableCell
                      className={
                        balances[index] < 0
                          ? "text-right font-semibold text-destructive"
                          : "text-right font-semibold"
                      }
                    >
                      {formatINR(balances[index])}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        A struck-through row has been reversed. Its mirror entry is in the list too, and the pair
        nets to zero — nothing was removed.
      </p>
    </div>
  );
}
