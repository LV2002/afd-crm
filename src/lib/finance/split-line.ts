import { and, eq, sql } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { recordPayment } from "@/lib/enrolment/record-payment";
import { bankMatches, bankStatementLines, financeAccounts } from "@/lib/db/schema";

import { methodFromNarration } from "./category-links";
import { postEntry, postTransfer } from "./post";

/**
 * One bank credit that is really several students' payments, settled
 * together by a payment gateway.
 *
 * The gateway is a clearing account of its own. Each student's payment goes
 * into it at the amount THEY paid (so each gets a payment and a receipt for
 * the right amount), the gateway's charge comes out of it, and what is left
 * moves to the bank in one transfer. That one transfer is the single entry
 * the bank line pairs with, which is exactly what the bank statement shows:
 * one credit, for the net.
 *
 *   students paid        ₹1,00,000 + ₹40,000 + ₹60,000 = ₹2,00,000
 *   gateway kept          ₹4,720
 *   bank received         ₹1,95,280   <- the statement line
 *   gateway account left  ₹0
 *
 * The amounts must add up exactly; a rupee that is not accounted for is a
 * rupee someone will chase later, so it is refused here instead.
 */

export interface Allocation {
  enrolmentId: string;
  amountPaise: number;
}

export function splitShortfall(allocations: Allocation[], gatewayFeePaise: number, linePaise: number): number {
  const gross = allocations.reduce((s, a) => s + a.amountPaise, 0);
  return gross - gatewayFeePaise - linePaise;
}

export async function splitCreditLine(
  tx: DbExecutor,
  input: {
    line: typeof bankStatementLines.$inferSelect;
    allocations: Allocation[];
    gatewayFeePaise: number;
    gatewayAccountId: string;
    /** Category the students' payments are filed under. */
    feeCategory: string;
    /** Category the gateway's charge is filed under. */
    chargeCategory: string;
    userId: string | null;
  },
): Promise<{ paymentIds: string[]; bankLegId: string }> {
  const { line, allocations } = input;
  if (line.direction !== "in") throw new Error("Only money coming in can be split between students.");
  if (allocations.length === 0) throw new Error("Add at least one student.");
  if (allocations.some((a) => !Number.isInteger(a.amountPaise) || a.amountPaise <= 0)) throw new Error("Every student needs an amount above zero.");
  if (!Number.isInteger(input.gatewayFeePaise) || input.gatewayFeePaise < 0) throw new Error("The gateway charge cannot be negative.");

  const off = splitShortfall(allocations, input.gatewayFeePaise, line.amountPaise);
  if (off !== 0) {
    const rupees = (Math.abs(off) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 });
    throw new Error(
      off > 0
        ? `The students' amounts less the gateway charge come to ₹${rupees} more than the bank received.`
        : `₹${rupees} of what the bank received is not yet assigned to a student or the gateway charge.`,
    );
  }

  const [gateway] = await tx.select().from(financeAccounts).where(eq(financeAccounts.id, input.gatewayAccountId));
  if (!gateway || gateway.type !== "gateway" || !gateway.isActive) throw new Error("Pick the payment gateway account.");
  if (gateway.id === line.accountId) throw new Error("The gateway account must be different from the bank account.");

  const [claimed] = await tx
    .update(bankStatementLines)
    .set({ status: "posted", resolvedBy: input.userId, resolvedAt: sql`now()` })
    .where(and(eq(bankStatementLines.id, line.id), eq(bankStatementLines.status, "pending")))
    .returning({ id: bankStatementLines.id });
  if (!claimed) throw new Error("That line was just dealt with by somebody else.");

  const narration = line.note ? `${line.particulars} — ${line.note}` : line.particulars;
  const paymentIds: string[] = [];
  for (const a of allocations) {
    const paid = await recordPayment(tx, {
      enrolmentId: a.enrolmentId,
      amountPaise: a.amountPaise,
      method: methodFromNarration(line.particulars),
      reference: line.particulars.slice(0, 120),
      recordedBy: input.userId,
      accountId: gateway.id,
      receivedAt: new Date(`${line.occurredOn}T12:00:00+05:30`),
      category: input.feeCategory,
    });
    paymentIds.push(paid.paymentId);
  }

  if (input.gatewayFeePaise > 0) {
    await postEntry(tx, {
      occurredOn: line.occurredOn,
      direction: "out",
      kind: "expense",
      accountId: gateway.id,
      category: input.chargeCategory,
      amountPaise: input.gatewayFeePaise,
      description: `Payment gateway charge — ${narration.slice(0, 80)}`,
      recordedBy: input.userId,
      source: "bank_statement",
    });
  }

  const settled = await postTransfer(tx, {
    occurredOn: line.occurredOn,
    fromAccountId: gateway.id,
    toAccountId: line.accountId,
    amountPaise: line.amountPaise,
    description: `Gateway settlement — ${narration.slice(0, 80)}`,
    recordedBy: input.userId,
    source: "bank_statement",
  });

  await tx.update(bankStatementLines).set({ transactionId: settled.in.id }).where(eq(bankStatementLines.id, line.id));
  await tx.insert(bankMatches).values({
    bankLineId: line.id,
    transactionId: settled.in.id,
    centerId: line.centerId,
    method: "categorised",
    matchedBy: input.userId,
    note: `Split between ${allocations.length} student${allocations.length === 1 ? "" : "s"}`,
  });
  return { paymentIds, bankLegId: settled.in.id };
}
