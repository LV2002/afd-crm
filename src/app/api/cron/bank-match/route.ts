import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { requireCronSecret } from "@/lib/cron/require-secret";
import { db } from "@/lib/db/client";
import { financeAccounts } from "@/lib/db/schema";
import { reportingFailures } from "@/lib/errors/capture";
import { autoMatchAccount } from "@/lib/finance/reconcile";

export const dynamic = "force-dynamic";

/**
 * Pairs statement lines with ledger entries that arrived since the last run,
 * for every bank account. Only pairs what is unambiguous; the rest stays on
 * the Reconciliation page. Safe to run as often as you like.
 */
async function run(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const accounts = await db
    .select({ id: financeAccounts.id })
    .from(financeAccounts)
    .where(eq(financeAccounts.type, "bank"));
  let paired = 0;
  for (const account of accounts) paired += await autoMatchAccount(db, account.id);
  return NextResponse.json({ accounts: accounts.length, paired });
}

export async function GET(request: Request) {
  return reportingFailures("cron:bank-match", () => run(request));
}
