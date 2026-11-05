import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { getBankAccounts, getPendingLines } from "@/lib/finance/bank-queries";
import { SKIP_OPTIONS } from "@/lib/finance/bank-constants";
import { getFinanceCenterId } from "@/lib/finance/center-filter";
import { getFinanceCategories } from "@/lib/finance/get-finance";
import { createClient } from "@/lib/supabase/server";

import { ImportPanel } from "./import-panel";
import { PendingQueue } from "./pending-queue";

const PAGE_SIZE = 200;

/**
 * Bank statement → ledger.
 *
 * The accountant uploads the bank's CSV, sees what is new, imports it, and
 * then does the one job only a person can: say what each line was. The
 * statement itself is read in memory and never saved.
 */
export default async function BankImportPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; dir?: string; q?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !can(user, "finance.record")) return <AccessDenied />;

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const supabase = await createClient();
  const centerId = await getFinanceCenterId(supabase);

  const [accounts, categories, pending] = await Promise.all([
    getBankAccounts(supabase, centerId),
    getFinanceCategories(supabase),
    getPendingLines(supabase, {
      accountId: params.account || undefined,
      centerId,
      direction: params.dir === "in" || params.dir === "out" ? params.dir : undefined,
      q: params.q?.trim() || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
  ]);

  if (accounts.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        There is no bank account to import into yet.{" "}
        <Link href="/finance/accounts" className="font-medium underline">
          Add one under Bank &amp; cash accounts
        </Link>{" "}
        — pick the centre it belongs to — then come back.
      </p>
    );
  }

  const canImport = can(user, "bank.import");
  const canReconcile = can(user, "bank.reconcile");
  const accountNames = Object.fromEntries(accounts.map((a) => [a.id, a.name]));

  return (
    <div className="flex flex-col gap-8">
      {canImport ? (
        <ImportPanel accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} />
      ) : (
        <p className="max-w-3xl rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Bank statements are uploaded by the people who review the bank side, not by whoever keeps the books. Lines
          they upload appear below for you to record; anything not yet in the books is listed under{" "}
          <Link href="/finance/reconcile" className="font-medium underline">
            Reconciliation
          </Link>
          .
        </p>
      )}
      <PendingQueue
        lines={pending.lines}
        total={pending.total}
        page={page}
        pageSize={PAGE_SIZE}
        accountNames={accountNames}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        filters={{ account: params.account ?? "", dir: params.dir ?? "", q: params.q ?? "" }}
        incomeCategories={categories.income.map((c) => c.label)}
        expenseCategories={categories.expense.map((c) => c.label)}
        skipOptions={canReconcile ? SKIP_OPTIONS : []}
      />
    </div>
  );
}
