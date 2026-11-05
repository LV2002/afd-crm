import { and, eq, sql } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { bankMatches, bankStatementLines } from "@/lib/db/schema";

import type { StatementLine } from "./bank-statement";
import { postEntry } from "./post";

/**
 * The two writes behind the bank import screen, kept apart from the Server
 * Actions that authorise them so the money rules can be tested against a
 * real database without a login.
 */

/** Saves lines not already present for the account. Returns how many were new. */
export async function saveStatementLines(
  tx: DbExecutor,
  input: {
    accountId: string;
    centerId: string;
    importedBy: string | null;
    lines: Array<Omit<StatementLine, "row">>;
  },
): Promise<number> {
  if (input.lines.length === 0) return 0;
  // ON CONFLICT DO NOTHING, so two people importing the same statement at
  // once, or a double-click, still add each line exactly once.
  const inserted = await tx
    .insert(bankStatementLines)
    .values(
      input.lines.map((l) => ({
        accountId: input.accountId,
        centerId: input.centerId,
        occurredOn: l.occurredOn,
        particulars: l.particulars,
        direction: l.direction,
        amountPaise: l.amountPaise,
        balancePaise: l.balancePaise,
        note: l.note,
        dateGuessed: l.dateGuessed,
        fingerprint: l.fingerprint,
        importedBy: input.importedBy,
      })),
    )
    .onConflictDoNothing({ target: [bankStatementLines.accountId, bankStatementLines.fingerprint] })
    .returning({ id: bankStatementLines.id });
  return inserted.length;
}

/**
 * Categorises lines, or sets them aside, inside the caller's transaction.
 *
 * Each line is claimed first with a conditional UPDATE that only matches a
 * `pending` row; zero rows back means somebody else already dealt with it,
 * and nothing is posted. That is what stops a double-click, or two
 * accountants on the same list, from counting one rupee twice. The claim and
 * the ledger row commit together or not at all.
 */
export async function resolveBankLines(
  tx: DbExecutor,
  input: {
    lines: Array<typeof bankStatementLines.$inferSelect>;
    direction: "in" | "out";
    choice: string;
    skipReason: string | null;
    userId: string | null;
  },
): Promise<number> {
  let done = 0;
  for (const line of input.lines) {
    const [claimed] = await tx
      .update(bankStatementLines)
      .set({
        status: input.skipReason ? "skipped" : "posted",
        skipReason: input.skipReason,
        resolvedBy: input.userId,
        resolvedAt: sql`now()`,
      })
      .where(and(eq(bankStatementLines.id, line.id), eq(bankStatementLines.status, "pending")))
      .returning({ id: bankStatementLines.id });
    if (!claimed) continue;

    if (input.skipReason) {
      // Setting a line aside is accepting that it has no ledger entry, so it
      // is recorded as a waiver: visible, attributed, and reviewable.
      await tx.insert(bankMatches).values({
        bankLineId: line.id,
        transactionId: null,
        centerId: line.centerId,
        method: "waived",
        matchedBy: input.userId,
        note: input.skipReason,
      });
    } else {
      const posted = await postEntry(tx, {
        occurredOn: line.occurredOn,
        direction: input.direction,
        kind: input.direction === "in" ? "other_income" : "expense",
        accountId: line.accountId,
        category: input.choice,
        amountPaise: line.amountPaise,
        description: line.note ? `${line.particulars} — ${line.note}` : line.particulars,
        recordedBy: input.userId,
        source: "bank_statement",
      });
      await tx
        .update(bankStatementLines)
        .set({ transactionId: posted.id })
        .where(eq(bankStatementLines.id, line.id));
      // The entry was made from this very line, so the pair is certain.
      await tx.insert(bankMatches).values({
        bankLineId: line.id,
        transactionId: posted.id,
        centerId: line.centerId,
        method: "categorised",
        matchedBy: input.userId,
      });
    }
    done++;
  }
  return done;
}
