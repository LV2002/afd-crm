import { AccessDenied } from "@/components/layout/access-denied";
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
import { formatINR } from "@/lib/format/currency";
import { getAccountsWithBalances } from "@/lib/finance/get-finance";
import { createClient } from "@/lib/supabase/server";

import { AccountForm } from "./account-form";

/**
 * Every bank account, cash box and petty cash float.
 *
 * Rows, not the three fixed ledgers the workbook began with: a second bank
 * account or a new centre is data somebody adds here, never a change to
 * the software.
 *
 * The opening balance is the one figure that needs care — it is the
 * balance on the day the CRM took over, and everything after it is the
 * ledger's own arithmetic. Getting it wrong shifts every balance by the
 * same amount, which is at least obvious.
 */
export default async function FinanceAccountsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "finance.manage")) return <AccessDenied />;

  const supabase = await createClient();
  const [accounts, { data: centers }] = await Promise.all([
    getAccountsWithBalances(supabase, { includeInactive: true }),
    supabase
      .from("centers")
      .select("id, name")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name")
      .returns<Array<{ id: string; name: string }>>(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Bank &amp; cash accounts
        </h2>
        {accounts.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            None yet. Add your first below.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Centre</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Opening</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Entries</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">
                    {account.name}
                    {!account.is_active && (
                      <Badge variant="outline" className="ml-2">
                        Inactive
                      </Badge>
                    )}
                    {account.needsTopUp && (
                      <Badge variant="outline" className="ml-2">
                        Low float
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{account.centerName}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {account.type.replace("_", " ")}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatINR(account.opening_balance_paise)}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatINR(account.balancePaise)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {account.entryCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-xs text-muted-foreground">
          An account with history is never deleted — switch it off instead, so its entries keep
          pointing somewhere.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Add or edit an account
        </h2>
        <AccountForm
          centers={centers ?? []}
          accounts={accounts.map((a) => ({
            id: a.id,
            name: a.name,
            centerId: a.center_id,
            type: a.type,
            openingBalancePaise: a.opening_balance_paise,
            floatPaise: a.float_paise,
            isActive: a.is_active,
          }))}
        />
      </section>
    </div>
  );
}
