import { eq, sql } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { financeTransactionComments } from "@/lib/db/schema";

/**
 * Notes on a transaction. The ledger row is never edited, so what a payment
 * was for ("Simi's second mobile, October") is written beside it, and unlike
 * the row it can be corrected later. The caller writes the audit entry; the
 * words an edit replaced go there.
 */

export const MAX_COMMENT = 1000;

/** The text to store, or null when there is nothing worth keeping. */
export function cleanComment(raw: string | null | undefined): string | null {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, MAX_COMMENT) : null;
}

export async function addComment(
  tx: DbExecutor,
  input: { transactionId: string; body: string; userId: string | null },
): Promise<string> {
  const body = cleanComment(input.body);
  if (!body) throw new Error("Write the comment first.");
  const [row] = await tx
    .insert(financeTransactionComments)
    .values({ transactionId: input.transactionId, body, createdBy: input.userId })
    .returning({ id: financeTransactionComments.id });
  return row.id;
}

/** Replaces the words and returns what they were, for the audit log. */
export async function editComment(
  tx: DbExecutor,
  input: { commentId: string; body: string; userId: string | null },
): Promise<{ before: string; transactionId: string }> {
  const body = cleanComment(input.body);
  if (!body) throw new Error("A comment cannot be empty.");
  const [existing] = await tx.select().from(financeTransactionComments).where(eq(financeTransactionComments.id, input.commentId));
  if (!existing) throw new Error("That comment no longer exists.");
  await tx
    .update(financeTransactionComments)
    .set({ body, editedBy: input.userId, editedAt: sql`now()` })
    .where(eq(financeTransactionComments.id, input.commentId));
  return { before: existing.body, transactionId: existing.transactionId };
}
