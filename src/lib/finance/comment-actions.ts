"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { financeTransactionComments } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

import { addComment, editComment } from "./comments";

export interface CommentState {
  error?: string;
  success?: string;
}

/**
 * Whether the caller may see this transaction. Read through the RLS-bound
 * client on purpose, so the same centre rule that hides an entry hides its
 * notes, without that rule being written out a second time here.
 */
async function canSee(transactionId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("finance_transactions").select("id").eq("id", transactionId).maybeSingle<{ id: string }>();
  return Boolean(data);
}

export async function addTransactionComment(transactionId: string, body: string): Promise<CommentState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "finance.record")) return { error: "You don't have permission to do that." };
  if (!(await canSee(transactionId))) return { error: "That entry is outside your centre, or no longer exists." };
  try {
    const id = await addComment(db, { transactionId, body, userId: user.id });
    await writeAuditLog(await createClient(), {
      actorId: user.id,
      action: "finance.comment_add",
      entityType: "finance_transactions",
      entityId: transactionId,
      after: { commentId: id, body: body.trim().slice(0, 1000) },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save the comment." };
  }
  revalidatePath("/finance", "layout");
  return { success: "Comment added." };
}

export async function editTransactionComment(commentId: string, body: string): Promise<CommentState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "finance.record")) return { error: "You don't have permission to do that." };
  try {
    // Which entry it is on, checked against the caller's own centres before anything changes.
    const [existing] = await db
      .select({ transactionId: financeTransactionComments.transactionId })
      .from(financeTransactionComments)
      .where(eq(financeTransactionComments.id, commentId));
    if (!existing) return { error: "That comment no longer exists." };
    if (!(await canSee(existing.transactionId))) return { error: "That entry is outside your centre." };
    const result = await editComment(db, { commentId, body, userId: user.id });
    await writeAuditLog(await createClient(), {
      actorId: user.id,
      action: "finance.comment_edit",
      entityType: "finance_transactions",
      entityId: result.transactionId,
      before: { commentId, body: result.before },
      after: { commentId, body: body.trim().slice(0, 1000) },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save the comment." };
  }
  revalidatePath("/finance", "layout");
  return { success: "Comment saved." };
}
