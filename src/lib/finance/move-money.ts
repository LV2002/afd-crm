import { and, eq, sql } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { bankMatches, bankStatementLines } from "@/lib/db/schema";

import { postTransfer } from "./post";

/**
 * A bank line that is money moving between two of the institute's own
 * accounts: one of its bank accounts to another, to a cash box, to a payment
 * gateway, or to and from a director account. Not income, not an expense, but
 * in the books on both sides, so the bank balance still agrees and the other
 * account's balance moves by the same amount.
 *
 * Both legs are posted, and the bank line is paired with this account's leg.
 * If the other account is also a bank account, its own statement line will
 * arrive later and pair with the leg already posted there (same amount and
 * direction, close date), so the move is never counted twice. If the other
 * leg already exists, because that statement was categorised first, this
 * line pairs with it and nothing new is posted.
 */

/** Days either side within which an existing leg is taken to be the same move. */
const SAME_MOVE_DAYS = 14;

export async function moveLinesToAccount(
  tx: DbExecutor,
  input: {
    lines: Array<typeof bankStatementLines.$inferSelect>;
    otherAccountId: string;
    userId: string | null;
  },
): Promise<number> {
  let done = 0;
  for (const line of input.lines) {
    if (line.accountId === input.otherAccountId) throw new Error("Pick a different account from the one the money is in.");

    const [claimed] = await tx
      .update(bankStatementLines)
      .set({ status: "posted", resolvedBy: input.userId, resolvedAt: sql`now()` })
      .where(and(eq(bankStatementLines.id, line.id), eq(bankStatementLines.status, "pending")))
      .returning({ id: bankStatementLines.id });
    if (!claimed) continue;

    const incoming = line.direction === "in";
    const thisLeg = incoming ? "transfer_in" : "transfer_out";

    // The other side may already be in the books (its own statement came first).
    const existing = await tx.execute<{ id: string }>(sql`
      select t.id
      from finance_transactions t
      where t.account_id = ${line.accountId}::uuid
        and t.direction = ${thisLeg}::finance_direction
        and t.kind = 'transfer'
        and t.amount_paise = ${line.amountPaise}
        and abs(t.occurred_on - ${line.occurredOn}::date) <= ${SAME_MOVE_DAYS}
        and not exists (select 1 from bank_matches m where m.transaction_id = t.id and m.active)
        and not exists (select 1 from finance_transactions r where r.reverses_transaction_id = t.id)
        and exists (
          select 1 from finance_transactions o
          where o.transfer_group_id = t.transfer_group_id and o.id <> t.id and o.account_id = ${input.otherAccountId}::uuid
        )
      order by abs(t.occurred_on - ${line.occurredOn}::date), t.txn_no
      limit 1
    `);

    let legId: string;
    if (existing[0]) {
      legId = existing[0].id;
    } else {
      const description = line.note ? `${line.particulars} — ${line.note}` : line.particulars;
      const posted = await postTransfer(tx, {
        occurredOn: line.occurredOn,
        fromAccountId: incoming ? input.otherAccountId : line.accountId,
        toAccountId: incoming ? line.accountId : input.otherAccountId,
        amountPaise: line.amountPaise,
        description,
        recordedBy: input.userId,
        source: "bank_statement",
      });
      legId = incoming ? posted.in.id : posted.out.id;
    }

    await tx.update(bankStatementLines).set({ transactionId: legId }).where(eq(bankStatementLines.id, line.id));
    await tx.insert(bankMatches).values({
      bankLineId: line.id,
      transactionId: legId,
      centerId: line.centerId,
      method: "categorised",
      matchedBy: input.userId,
      note: existing[0] ? "Paired with the other side of this transfer, already in the books" : null,
    });
    done++;
  }
  return done;
}
