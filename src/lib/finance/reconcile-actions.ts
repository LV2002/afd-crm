"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser, scopeFor, type SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { bankMatches, bankStatementLines } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

import { autoMatchAccount, matchManually, unmatch, waiveLine } from "./reconcile";

export interface ReconcileFormState {
  error?: string;
  success?: string;
}

function revalidate() {
  revalidatePath("/finance/reconcile");
  revalidatePath("/finance/bank");
  revalidatePath("/finance/transactions");
}

async function reviewer(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  return user && can(user, "bank.reconcile") ? user : null;
}

/** Whether this reviewer may touch an account's centre. */
function inScope(user: SessionUser, centerId: string): boolean {
  return scopeFor(user, "bank.reconcile") === "all" || user.centerIds.includes(centerId);
}

async function audit(user: SessionUser, action: string, entityId: string, after: Record<string, unknown>) {
  const supabase = await createClient();
  await writeAuditLog(supabase, { actorId: user.id, action, entityType: "bank_matches", entityId, after });
}

export async function matchLine(_prev: ReconcileFormState, formData: FormData): Promise<ReconcileFormState> {
  const user = await reviewer();
  if (!user) return { error: "You don't have permission to do that." };
  const bankLineId = String(formData.get("bankLineId") ?? "");
  const transactionId = String(formData.get("transactionId") ?? "");
  if (!bankLineId || !transactionId) return { error: "Pick the entry to pair it with." };

  const [line] = await db.select().from(bankStatementLines).where(eq(bankStatementLines.id, bankLineId));
  if (!line || !inScope(user, line.centerId)) return { error: "That line is outside your centre." };

  const result = await matchManually(db, { bankLineId, transactionId, userId: user.id });
  if (!result.ok) return { error: result.error };
  await audit(user, "finance.bank_match", bankLineId, { transactionId, method: "manual" });
  revalidate();
  return { success: "Paired." };
}

export async function waiveStatementLine(_prev: ReconcileFormState, formData: FormData): Promise<ReconcileFormState> {
  const user = await reviewer();
  if (!user) return { error: "You don't have permission to do that." };
  const bankLineId = String(formData.get("bankLineId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const [line] = await db.select().from(bankStatementLines).where(eq(bankStatementLines.id, bankLineId));
  if (!line || !inScope(user, line.centerId)) return { error: "That line is outside your centre." };

  const result = await waiveLine(db, { bankLineId, userId: user.id, reason });
  if (!result.ok) return { error: result.error };
  await audit(user, "finance.bank_waive", bankLineId, { reason });
  revalidate();
  return { success: "Accepted as having no entry." };
}

export async function undoPair(_prev: ReconcileFormState, formData: FormData): Promise<ReconcileFormState> {
  const user = await reviewer();
  if (!user) return { error: "You don't have permission to do that." };
  const matchId = String(formData.get("matchId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const [match] = await db.select().from(bankMatches).where(eq(bankMatches.id, matchId));
  if (!match || !inScope(user, match.centerId)) return { error: "That pair is outside your centre." };

  const result = await unmatch(db, { matchId, userId: user.id, reason });
  if (!result.ok) return { error: result.error };
  await audit(user, "finance.bank_unmatch", matchId, { reason, method: match.method });
  revalidate();
  return { success: "Undone. Both sides are open again." };
}

export async function runMatching(_prev: ReconcileFormState, formData: FormData): Promise<ReconcileFormState> {
  const user = await reviewer();
  if (!user) return { error: "You don't have permission to do that." };
  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) return { error: "Which account?" };
  const paired = await autoMatchAccount(db, accountId);
  if (paired > 0) await audit(user, "finance.bank_auto_match", accountId, { paired });
  revalidate();
  return { success: paired === 0 ? "Nothing more can be paired without guessing." : `Paired ${paired}.` };
}
