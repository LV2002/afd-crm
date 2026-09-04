import { and, eq, isNull } from "drizzle-orm";

import { db, type DbExecutor } from "@/lib/db/client";
import { financeAccounts, financeTransactions } from "@/lib/db/schema";

import type { FinanceDirection, FinanceKind } from "./ledger-math";

/**
 * The only functions allowed to record money.
 *
 * Kept apart from the Server Actions that call them for the same reason
 * `confirmAdmission()` and `recordPayment()` are: the rules about what a
 * ledger entry may look like belong with the ledger, not with a form.
 * Every one of these takes a `DbExecutor`, so a caller can post several
 * rows — the two legs of a transfer, a reversal and its replacement — in
 * one transaction that either all happens or none of it does.
 */

export const FEE_CATEGORY = "Course Fees";
export const TRANSFER_CATEGORY = "Fund Transfer";

export interface PostEntryInput {
  occurredOn: string;
  direction: FinanceDirection;
  kind: FinanceKind;
  accountId: string;
  category: string;
  amountPaise: number;
  description: string;
  reference?: string | null;
  paymentId?: string | null;
  enrolmentId?: string | null;
  studentId?: string | null;
  studentName?: string | null;
  course?: string | null;
  transferGroupId?: string | null;
  reversesTransactionId?: string | null;
  reversalReason?: string | null;
  recordedBy?: string | null;
  source?: string | null;
}

export interface PostedEntry {
  id: string;
  txnNo: number;
  centerId: string;
}

/**
 * Appends one row. The centre is copied off the account rather than taken
 * from the caller: the account is the thing that belongs to a centre, and
 * letting a form supply it would allow an entry to be filed under a centre
 * whose money it never touched.
 */
export async function postEntry(tx: DbExecutor, input: PostEntryInput): Promise<PostedEntry> {
  const [account] = await tx
    .select({ id: financeAccounts.id, centerId: financeAccounts.centerId, isActive: financeAccounts.isActive })
    .from(financeAccounts)
    .where(and(eq(financeAccounts.id, input.accountId), isNull(financeAccounts.deletedAt)));

  if (!account) throw new Error("That account no longer exists.");
  // A reversal may land on a deactivated account — the money did go
  // through it, and refusing would leave the original uncorrectable.
  if (!account.isActive && !input.reversesTransactionId) {
    throw new Error("That account is not active. Reactivate it, or pick another.");
  }

  const [row] = await tx
    .insert(financeTransactions)
    .values({
      occurredOn: input.occurredOn,
      direction: input.direction,
      kind: input.kind,
      accountId: input.accountId,
      centerId: account.centerId,
      category: input.category,
      amountPaise: input.amountPaise,
      description: input.description,
      reference: input.reference ?? null,
      paymentId: input.paymentId ?? null,
      enrolmentId: input.enrolmentId ?? null,
      studentId: input.studentId ?? null,
      studentName: input.studentName ?? null,
      course: input.course ?? null,
      transferGroupId: input.transferGroupId ?? null,
      reversesTransactionId: input.reversesTransactionId ?? null,
      reversalReason: input.reversalReason ?? null,
      recordedBy: input.recordedBy ?? null,
      source: input.source ?? null,
    })
    .returning({ id: financeTransactions.id, txnNo: financeTransactions.txnNo });

  return { id: row.id, txnNo: row.txnNo, centerId: account.centerId };
}

/**
 * Moves money between two of the institute's own accounts.
 *
 * Two rows, not one, because an account statement has to show it leaving
 * one and arriving in the other. They share a `transfer_group_id` so the
 * pair can be shown together, and both are `transfer_*` directions so the
 * reports leave them out of income and expenses entirely — see
 * `periodTotals()` for why that matters.
 */
export async function postTransfer(
  tx: DbExecutor,
  input: {
    occurredOn: string;
    fromAccountId: string;
    toAccountId: string;
    amountPaise: number;
    description: string;
    recordedBy?: string | null;
    source?: string | null;
  },
): Promise<{ out: PostedEntry; in: PostedEntry }> {
  if (input.fromAccountId === input.toAccountId) {
    throw new Error("The two accounts must be different.");
  }

  const transferGroupId = crypto.randomUUID();
  const common = {
    occurredOn: input.occurredOn,
    kind: "transfer" as const,
    category: TRANSFER_CATEGORY,
    amountPaise: input.amountPaise,
    description: input.description,
    transferGroupId,
    recordedBy: input.recordedBy,
    source: input.source,
  };

  const outLeg = await postEntry(tx, {
    ...common,
    direction: "transfer_out",
    accountId: input.fromAccountId,
  });
  const inLeg = await postEntry(tx, {
    ...common,
    direction: "transfer_in",
    accountId: input.toAccountId,
  });

  return { out: outLeg, in: inLeg };
}

export interface ReversalResult {
  reversal: PostedEntry;
  original: typeof financeTransactions.$inferSelect;
}

/**
 * Reverses a posted entry by appending its mirror image.
 *
 * The amount is negated, everything else is copied. Nothing about the
 * original row is touched — there is no UPDATE policy on this table for
 * anybody, so there could not be. "Reversed" is answered by asking whether
 * another row points at this one, which means the answer cannot drift from
 * the arithmetic the way a status column can.
 */
export async function reverseTransaction(
  tx: DbExecutor,
  input: {
    transactionId: string;
    reason: string;
    recordedBy?: string | null;
    source?: string | null;
  },
): Promise<ReversalResult> {
  const [original] = await tx
    .select()
    .from(financeTransactions)
    .where(eq(financeTransactions.id, input.transactionId));

  if (!original) throw new Error("No transaction with that reference.");
  if (original.reversesTransactionId) {
    throw new Error("That entry is itself a reversal, so it cannot be reversed.");
  }

  const [alreadyReversed] = await tx
    .select({ id: financeTransactions.id })
    .from(financeTransactions)
    .where(eq(financeTransactions.reversesTransactionId, original.id));
  if (alreadyReversed) throw new Error("That entry has already been reversed.");

  const reversal = await postEntry(tx, {
    occurredOn: original.occurredOn,
    direction: original.direction,
    kind: original.kind,
    accountId: original.accountId,
    category: original.category,
    amountPaise: -original.amountPaise,
    description: `Reversal of #${original.txnNo} — ${input.reason}`,
    reference: original.reference,
    paymentId: original.paymentId,
    enrolmentId: original.enrolmentId,
    studentId: original.studentId,
    studentName: original.studentName,
    course: original.course,
    transferGroupId: original.transferGroupId,
    reversesTransactionId: original.id,
    reversalReason: input.reason,
    recordedBy: input.recordedBy,
    source: input.source,
  });

  return { reversal, original };
}

/**
 * A correction: reverse the wrong entry and post the right one, as a
 * single unit of work.
 *
 * Deliberately not an edit. An edit loses what was originally recorded,
 * and in a ledger the mistake is part of the history — an auditor asking
 * "what did you first write down, and when did you change it" has to be
 * able to get an answer.
 *
 * Both writes are inside the caller's transaction, so a correction can
 * never leave a reversal without its replacement.
 */
export async function correctTransaction(
  tx: DbExecutor,
  input: {
    transactionId: string;
    reason: string;
    occurredOn?: string | null;
    accountId?: string | null;
    amountPaise?: number | null;
    category?: string | null;
    description?: string | null;
    recordedBy?: string | null;
    source?: string | null;
  },
): Promise<{ reversal: PostedEntry; replacement: PostedEntry }> {
  const changed =
    input.occurredOn || input.accountId || input.amountPaise != null || input.category || input.description;
  if (!changed) {
    throw new Error("Nothing to correct — change the date, account, category, amount or description.");
  }

  const { reversal, original } = await reverseTransaction(tx, {
    transactionId: input.transactionId,
    reason: `corrected: ${input.reason}`,
    recordedBy: input.recordedBy,
    source: input.source,
  });

  const amountPaise = input.amountPaise ?? original.amountPaise;
  if (!(amountPaise > 0)) throw new Error("The corrected amount must be more than zero.");

  const replacement = await postEntry(tx, {
    occurredOn: input.occurredOn ?? original.occurredOn,
    direction: original.direction,
    kind: original.kind,
    accountId: input.accountId ?? original.accountId,
    category: input.category ?? original.category,
    amountPaise,
    description: `${input.description ?? original.description} (corrects #${original.txnNo})`,
    reference: original.reference,
    paymentId: original.paymentId,
    enrolmentId: original.enrolmentId,
    studentId: original.studentId,
    studentName: original.studentName,
    course: original.course,
    transferGroupId: original.transferGroupId,
    recordedBy: input.recordedBy,
    source: input.source,
  });

  return { reversal, replacement };
}

/** Active accounts a caller may post to, newest centre grouping first. */
export async function listPostableAccounts(): Promise<
  Array<{ id: string; name: string; centerId: string; type: string }>
> {
  return db
    .select({
      id: financeAccounts.id,
      name: financeAccounts.name,
      centerId: financeAccounts.centerId,
      type: financeAccounts.type,
    })
    .from(financeAccounts)
    .where(and(eq(financeAccounts.isActive, true), isNull(financeAccounts.deletedAt)))
    .orderBy(financeAccounts.name);
}
