import { and, eq, sql } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { bankMatches, bankStatementLines, financeTransactions } from "@/lib/db/schema";

import { effectiveDirection, planMatches, type RecLine, type RecTxn } from "./reconcile-plan";

/**
 * Reconciliation writes. Callers check `bank.reconcile` (or, for the
 * automatic and categorise paths, are the server itself) before calling.
 */

/** Ledger entries in one account that still need a statement line. */
export async function unmatchedLedgerRows(tx: DbExecutor, accountId: string) {
  const rows = await tx.execute<{
    id: string;
    occurred_on: string;
    direction: "in" | "out" | "transfer_in" | "transfer_out";
    amount_paise: string | number;
    reference: string | null;
  }>(sql`
    select t.id, t.occurred_on::text as occurred_on, t.direction, t.amount_paise, t.reference
    from finance_transactions t
    where t.account_id = ${accountId}::uuid
      and not exists (select 1 from bank_matches m where m.transaction_id = t.id and m.active)
      -- A mistake and its correction cancel out and never touched the bank:
      -- neither side is an exception. (If the original WAS matched, the
      -- reversal stays here, because the bank must show the money go back.)
      and not (
        t.reverses_transaction_id is not null
        and not exists (select 1 from bank_matches m where m.transaction_id = t.reverses_transaction_id and m.active)
      )
      and not exists (select 1 from finance_transactions r where r.reverses_transaction_id = t.id)
  `);
  return [...rows];
}

export async function unmatchedStatementLines(tx: DbExecutor, accountId: string) {
  const rows = await tx.execute<{
    id: string;
    occurred_on: string;
    direction: "in" | "out";
    amount_paise: string | number;
    particulars: string;
  }>(sql`
    select l.id, l.occurred_on::text as occurred_on, l.direction, l.amount_paise, l.particulars
    from bank_statement_lines l
    where l.account_id = ${accountId}::uuid
      and not exists (select 1 from bank_matches m where m.bank_line_id = l.id and m.active)
  `);
  return [...rows];
}

/**
 * Pairs everything in this account that can be paired without guessing.
 * Safe to run any number of times, and by two people at once: the unique
 * indexes on active pairs make a double claim a no-op.
 */
export async function autoMatchAccount(tx: DbExecutor, accountId: string): Promise<number> {
  const [lines, txns, [account]] = await Promise.all([
    unmatchedStatementLines(tx, accountId),
    unmatchedLedgerRows(tx, accountId),
    tx.execute<{ center_id: string }>(sql`select center_id from finance_accounts where id = ${accountId}::uuid`),
  ]);
  if (!account || lines.length === 0 || txns.length === 0) return 0;

  const recLines: RecLine[] = lines.map((l) => ({
    id: l.id,
    occurredOn: l.occurred_on,
    direction: l.direction,
    amountPaise: Number(l.amount_paise),
    particulars: l.particulars,
  }));
  const recTxns: RecTxn[] = txns.map((t) => ({
    id: t.id,
    occurredOn: t.occurred_on,
    direction: effectiveDirection(t.direction, Number(t.amount_paise)),
    amountPaise: Math.abs(Number(t.amount_paise)),
    reference: t.reference,
  }));

  const pairs = planMatches(recLines, recTxns);
  if (pairs.length === 0) return 0;
  const inserted = await tx
    .insert(bankMatches)
    .values(
      pairs.map((p) => ({
        bankLineId: p.lineId,
        transactionId: p.transactionId,
        centerId: account.center_id,
        method: "auto" as const,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: bankMatches.id });
  return inserted.length;
}

export type ReconcileResult = { ok: true } | { ok: false; error: string };

/**
 * Pairs one line with one entry by hand. The money rule is not negotiable
 * even for the person allowed to do this: same account, same direction, same
 * amount to the paisa.
 */
export async function matchManually(
  tx: DbExecutor,
  input: { bankLineId: string; transactionId: string; userId: string; note?: string | null },
): Promise<ReconcileResult> {
  const [line] = await tx.select().from(bankStatementLines).where(eq(bankStatementLines.id, input.bankLineId));
  const [txn] = await tx.select().from(financeTransactions).where(eq(financeTransactions.id, input.transactionId));
  if (!line || !txn) return { ok: false, error: "That line or entry no longer exists." };
  if (line.accountId !== txn.accountId) return { ok: false, error: "They are in different accounts." };
  if (effectiveDirection(txn.direction, txn.amountPaise) !== line.direction) {
    return { ok: false, error: "One is money in and the other money out." };
  }
  if (Math.abs(txn.amountPaise) !== line.amountPaise) {
    return { ok: false, error: "The amounts are not the same. They have to match exactly." };
  }
  const inserted = await tx
    .insert(bankMatches)
    .values({
      bankLineId: line.id,
      transactionId: txn.id,
      centerId: line.centerId,
      method: "manual",
      matchedBy: input.userId,
      note: input.note ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: bankMatches.id });
  if (inserted.length === 0) return { ok: false, error: "One of them is already paired with something else." };
  return { ok: true };
}

/** Accepts a statement line as having no ledger entry. A reason is required. */
export async function waiveLine(
  tx: DbExecutor,
  input: { bankLineId: string; userId: string; reason: string },
): Promise<ReconcileResult> {
  const reason = input.reason.trim();
  if (reason.length < 5) return { ok: false, error: "Say why — a few words at least." };
  const [line] = await tx.select().from(bankStatementLines).where(eq(bankStatementLines.id, input.bankLineId));
  if (!line) return { ok: false, error: "That line no longer exists." };
  const inserted = await tx
    .insert(bankMatches)
    .values({
      bankLineId: line.id,
      transactionId: null,
      centerId: line.centerId,
      method: "waived",
      matchedBy: input.userId,
      note: reason,
    })
    .onConflictDoNothing()
    .returning({ id: bankMatches.id });
  if (inserted.length === 0) return { ok: false, error: "That line is already paired." };
  return { ok: true };
}

/** Undoes a pair or waiver. The row stays, marked inactive with who and why. */
export async function unmatch(
  tx: DbExecutor,
  input: { matchId: string; userId: string; reason: string },
): Promise<ReconcileResult & { bankLineId?: string }> {
  const reason = input.reason.trim();
  if (reason.length < 5) return { ok: false, error: "Say why — a few words at least." };
  const [row] = await tx
    .update(bankMatches)
    .set({ active: false, unmatchedBy: input.userId, unmatchedAt: sql`now()`, unmatchReason: reason })
    .where(and(eq(bankMatches.id, input.matchId), eq(bankMatches.active, true)))
    .returning({ bankLineId: bankMatches.bankLineId });
  if (!row) return { ok: false, error: "That pair was already undone." };
  return { ok: true, bankLineId: row.bankLineId };
}

/** After posting an entry: pair it straight away if its statement line is already in. Never throws into the caller. */
export async function matchSoon(tx: DbExecutor, accountIds: string[]): Promise<void> {
  try {
    for (const id of new Set(accountIds)) await autoMatchAccount(tx, id);
  } catch {
    // The hourly job will pair it; posting an entry must not fail over this.
  }
}
