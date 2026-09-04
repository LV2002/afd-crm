import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can, getCurrentUser } from "@/lib/auth/session";
import { formatDateIST } from "@/lib/format/date";
import { formatINR } from "@/lib/format/currency";
import { getAccountsWithBalances, getLedgerEntries, reversedIds } from "@/lib/finance/get-finance";
import { signedAmount } from "@/lib/finance/ledger-math";
import { createClient } from "@/lib/supabase/server";

import { EntryActions } from "./entry-actions";

/**
 * Everything, newest first — the workbook's Transactions sheet.
 *
 * The one place money is recorded, and the only place a mistake can be put
 * right. Reversal and correction live here rather than on their own
 * screens because both start from finding the wrong row, and a form that
 * asks you to type an entry number you copied off another page is a form
 * that gets the wrong number typed into it.
 */
export default async function FinanceTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; kind?: string }>;
}) {
  const { from, to, kind } = await searchParams;
  const user = await getCurrentUser();
  const supabase = await createClient();

  const [accounts, entries] = await Promise.all([
    getAccountsWithBalances(supabase, { includeInactive: true }),
    getLedgerEntries(supabase, {
      from,
      to,
      kind: isKind(kind) ? kind : undefined,
      limit: 500,
    }),
  ]);

  const reversed = reversedIds(entries);
  const accountNames = new Map(accounts.map((a) => [a.id, a.name]));
  const newestFirst = entries.slice().reverse();
  const canManage = Boolean(user && can(user, "finance.manage"));

  return (
    <div className="flex flex-col gap-4">
      {newestFirst.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nothing recorded yet.
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
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                {canManage && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {newestFirst.map((entry) => {
                const signed = signedAmount({
                  direction: entry.direction,
                  amountPaise: entry.amount_paise,
                });
                const isReversed = reversed.has(entry.id);
                const isReversal = Boolean(entry.reverses_transaction_id);
                return (
                  <TableRow key={entry.id} className={isReversed ? "opacity-60" : undefined}>
                    <TableCell className="text-muted-foreground">{entry.txn_no}</TableCell>
                    <TableCell>
                      {formatDateIST(`${entry.occurred_on}T00:00:00Z`, "d MMM yyyy")}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <span className={isReversed ? "line-through" : undefined}>
                        {entry.description}
                      </span>
                      {entry.student_name && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {entry.student_name}
                        </span>
                      )}
                      {isReversed && (
                        <Badge variant="outline" className="ml-2">
                          Reversed
                        </Badge>
                      )}
                      {isReversal && (
                        <Badge variant="outline" className="ml-2">
                          Reversal
                        </Badge>
                      )}
                      {entry.kind === "transfer" && (
                        <Badge variant="outline" className="ml-2">
                          Transfer
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{entry.category}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {accountNames.get(entry.account_id) ?? "—"}
                    </TableCell>
                    <TableCell
                      className={
                        signed < 0
                          ? "text-right font-semibold text-destructive"
                          : "text-right font-semibold"
                      }
                    >
                      {formatINR(signed)}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        {/* A fee row's cash side belongs to a receipt in
                            the payments ledger. Reversing it here would
                            leave the two disagreeing, so it is not
                            offered — a fee is corrected on the enrolment. */}
                        {!isReversed && !isReversal && entry.kind !== "fee" && (
                          <EntryActions
                            transactionId={entry.id}
                            txnNo={entry.txn_no}
                            accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
                          />
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Showing the most recent 500 entries. Nothing on this screen can be edited or deleted — a
        wrong entry is reversed, or corrected, and both leave a trail.
      </p>
    </div>
  );
}

function isKind(value: string | undefined): value is "fee" | "other_income" | "expense" | "transfer" {
  return value === "fee" || value === "other_income" || value === "expense" || value === "transfer";
}
