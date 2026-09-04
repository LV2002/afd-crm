"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { financeAccounts } from "@/lib/db/schema";
import { rupeesToPaise } from "@/lib/enrolment/instalment-plan";
import { createClient } from "@/lib/supabase/server";
import { and, eq, isNull } from "drizzle-orm";

import { correctTransaction, postEntry, postTransfer, reverseTransaction } from "./post";

export interface FinanceFormState {
  error?: string;
  success?: string;
}

/**
 * The finance intake forms — the CRM's version of the workbook's INTAKE
 * sheets. Expense, Other Income, Transfer, Reversal, Correction.
 *
 * Every one of these re-checks the caller's centre scope by hand before
 * writing. The ledger writers run on the direct database connection (they
 * have to: a transfer is two rows that must commit together, and the
 * `payments` path posts inside an existing transaction), and that
 * connection bypasses RLS — so the check RLS would have made is made here
 * instead, exactly as `saveFeePlan()` and `confirmAdmissionAction()`
 * already do.
 */

function revalidateFinance(): void {
  revalidatePath("/finance");
  revalidatePath("/finance/ledger");
  revalidatePath("/finance/transactions");
  revalidatePath("/finance/reports");
}

/** The centre an account belongs to, plus whether this caller may touch it. */
async function assertAccountInScope(
  accountId: string,
  permission: "finance.record" | "finance.manage",
): Promise<{ ok: true; centerId: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user || !can(user, permission)) {
    return { ok: false, error: "You don't have permission to do that." };
  }

  const [account] = await db
    .select({ centerId: financeAccounts.centerId, isActive: financeAccounts.isActive })
    .from(financeAccounts)
    .where(and(eq(financeAccounts.id, accountId), isNull(financeAccounts.deletedAt)));
  if (!account) return { ok: false, error: "That account no longer exists." };

  const scope = scopeFor(user, permission);
  // `own` cannot match: money has no owner the way a lead does, so a role
  // granted finance at own scope reaches nothing — which is the safe
  // reading of a configuration that does not make sense.
  if (scope !== "all" && !user.centerIds.includes(account.centerId)) {
    return { ok: false, error: "That account is outside your centre." };
  }
  return { ok: true, centerId: account.centerId };
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.");

const entrySchema = z.object({
  occurredOn: dateSchema,
  category: z.string().trim().min(1, "Pick a category."),
  description: z.string().trim().min(1, "Say what this was for."),
  accountId: z.string().uuid("Pick an account."),
  reference: z.string().trim().optional(),
});

function readAmount(formData: FormData): number | null {
  return rupeesToPaise(String(formData.get("amount") ?? ""));
}

/** Money going out: salaries, rent, ads, bank charges. */
export async function recordExpense(
  _prev: FinanceFormState,
  formData: FormData,
): Promise<FinanceFormState> {
  return recordSimpleEntry(formData, "out", "expense", "finance.expense");
}

/** Money coming in that is NOT student fees — those go through the fee ledger. */
export async function recordOtherIncome(
  _prev: FinanceFormState,
  formData: FormData,
): Promise<FinanceFormState> {
  return recordSimpleEntry(formData, "in", "other_income", "finance.income");
}

async function recordSimpleEntry(
  formData: FormData,
  direction: "in" | "out",
  kind: "expense" | "other_income",
  auditAction: string,
): Promise<FinanceFormState> {
  const parsed = entrySchema.safeParse({
    occurredOn: String(formData.get("occurredOn") ?? ""),
    category: String(formData.get("category") ?? ""),
    description: String(formData.get("description") ?? ""),
    accountId: String(formData.get("accountId") ?? ""),
    reference: String(formData.get("reference") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const amountPaise = readAmount(formData);
  if (amountPaise === null || amountPaise <= 0) {
    return { error: "Enter the amount as a number greater than zero." };
  }

  const scope = await assertAccountInScope(parsed.data.accountId, "finance.record");
  if (!scope.ok) return { error: scope.error };

  const user = await getCurrentUser();
  const posted = await db.transaction((tx) =>
    postEntry(tx, {
      occurredOn: parsed.data.occurredOn,
      direction,
      kind,
      accountId: parsed.data.accountId,
      category: parsed.data.category,
      amountPaise,
      description: parsed.data.description,
      reference: parsed.data.reference || null,
      recordedBy: user?.id ?? null,
      source: kind,
    }),
  );

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user!.id,
    action: auditAction,
    entityType: "finance_transactions",
    entityId: posted.id,
    after: { amountPaise, category: parsed.data.category, occurredOn: parsed.data.occurredOn },
  });

  revalidateFinance();
  return { success: `Recorded as entry #${posted.txnNo}.` };
}

/** Bank to cash box and back. Never counted as income or expense. */
export async function recordTransfer(
  _prev: FinanceFormState,
  formData: FormData,
): Promise<FinanceFormState> {
  const occurredOn = String(formData.get("occurredOn") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) return { error: "Pick a valid date." };

  const fromAccountId = String(formData.get("fromAccountId") ?? "");
  const toAccountId = String(formData.get("toAccountId") ?? "");
  if (!fromAccountId || !toAccountId) return { error: "Pick both accounts." };
  if (fromAccountId === toAccountId) return { error: "The two accounts must be different." };

  const amountPaise = readAmount(formData);
  if (amountPaise === null || amountPaise <= 0) {
    return { error: "Enter the amount as a number greater than zero." };
  }

  // Both ends are checked: moving money INTO a centre you cannot see would
  // be just as wrong as taking it out of one.
  for (const accountId of [fromAccountId, toAccountId]) {
    const scope = await assertAccountInScope(accountId, "finance.record");
    if (!scope.ok) return { error: scope.error };
  }

  const user = await getCurrentUser();
  const description = String(formData.get("description") ?? "").trim() || "Fund transfer";

  const result = await db.transaction((tx) =>
    postTransfer(tx, {
      occurredOn,
      fromAccountId,
      toAccountId,
      amountPaise,
      description,
      recordedBy: user?.id ?? null,
      source: "transfer",
    }),
  );

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user!.id,
    action: "finance.transfer",
    entityType: "finance_transactions",
    entityId: result.out.id,
    after: { amountPaise, fromAccountId, toAccountId, occurredOn },
  });

  revalidateFinance();
  return {
    success: `Transferred — entries #${result.out.txnNo} and #${result.in.txnNo}. Transfers are left out of income and expenses.`,
  };
}

/** Undo a posted entry by appending its mirror. Nothing is deleted. */
export async function reverseEntry(
  _prev: FinanceFormState,
  formData: FormData,
): Promise<FinanceFormState> {
  const transactionId = String(formData.get("transactionId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!transactionId) return { error: "Pick the entry to reverse." };
  if (!reason) return { error: "Say why — it goes on the record beside the reversal." };

  const guard = await assertEntryInScope(transactionId, "finance.manage");
  if (!guard.ok) return { error: guard.error };

  const user = await getCurrentUser();
  let result;
  try {
    result = await db.transaction((tx) =>
      reverseTransaction(tx, {
        transactionId,
        reason,
        recordedBy: user?.id ?? null,
        source: "reversal",
      }),
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not reverse that entry." };
  }

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user!.id,
    action: "finance.reversal",
    entityType: "finance_transactions",
    entityId: result.reversal.id,
    after: { reverses: transactionId, reason },
  });

  revalidateFinance();
  return {
    success: `Reversed by entry #${result.reversal.txnNo}. Both rows stay in the ledger and net to zero.`,
  };
}

/** Reverse the wrong entry and post the right one, in one step. */
export async function correctEntry(
  _prev: FinanceFormState,
  formData: FormData,
): Promise<FinanceFormState> {
  const transactionId = String(formData.get("transactionId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!transactionId) return { error: "Pick the entry to correct." };
  if (!reason) return { error: "Say what was wrong — it goes on the record." };

  const guard = await assertEntryInScope(transactionId, "finance.manage");
  if (!guard.ok) return { error: guard.error };

  const occurredOnRaw = String(formData.get("occurredOn") ?? "").trim();
  const accountIdRaw = String(formData.get("accountId") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "").trim();
  const descriptionRaw = String(formData.get("description") ?? "").trim();

  if (occurredOnRaw && !/^\d{4}-\d{2}-\d{2}$/.test(occurredOnRaw)) {
    return { error: "The corrected date isn't a valid date." };
  }
  let amountPaise: number | null = null;
  if (amountRaw) {
    amountPaise = rupeesToPaise(amountRaw);
    if (amountPaise === null || amountPaise <= 0) {
      return { error: "The corrected amount must be a number greater than zero." };
    }
  }
  if (accountIdRaw) {
    const scope = await assertAccountInScope(accountIdRaw, "finance.manage");
    if (!scope.ok) return { error: scope.error };
  }

  const user = await getCurrentUser();
  let result;
  try {
    result = await db.transaction((tx) =>
      correctTransaction(tx, {
        transactionId,
        reason,
        occurredOn: occurredOnRaw || null,
        accountId: accountIdRaw || null,
        amountPaise,
        category: categoryRaw || null,
        description: descriptionRaw || null,
        recordedBy: user?.id ?? null,
        source: "correction",
      }),
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not correct that entry." };
  }

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user!.id,
    action: "finance.correction",
    entityType: "finance_transactions",
    entityId: result.replacement.id,
    after: { corrects: transactionId, reason, amountPaise, occurredOn: occurredOnRaw || null },
  });

  revalidateFinance();
  return {
    success: `Corrected. Entry #${result.reversal.txnNo} reverses the original; #${result.replacement.txnNo} replaces it.`,
  };
}

/** Same scope check, starting from a transaction rather than an account. */
async function assertEntryInScope(
  transactionId: string,
  permission: "finance.manage",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user || !can(user, permission)) {
    return { ok: false, error: "You don't have permission to do that." };
  }

  // Read through the RLS-bound client on purpose: if the policy would not
  // show this caller the entry, they have no business reversing it, and
  // this is one line instead of re-deriving the centre rule by hand.
  const supabase = await createClient();
  const { data } = await supabase
    .from("finance_transactions")
    .select("id")
    .eq("id", transactionId)
    .maybeSingle<{ id: string }>();

  if (!data) return { ok: false, error: "No entry with that reference, or it's outside your centre." };
  return { ok: true };
}

// ── Accounts ───────────────────────────────────────────────────────────────

const accountSchema = z.object({
  name: z.string().trim().min(1, "Give the account a name."),
  centerId: z.string().uuid("Pick a centre."),
  type: z.enum(["bank", "cash", "petty_cash"]),
});

export async function saveAccount(
  _prev: FinanceFormState,
  formData: FormData,
): Promise<FinanceFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "finance.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const parsed = accountSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    centerId: String(formData.get("centerId") ?? ""),
    type: String(formData.get("type") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const scope = scopeFor(user, "finance.manage");
  if (scope !== "all" && !user.centerIds.includes(parsed.data.centerId)) {
    return { error: "That centre is outside your access." };
  }

  const openingRaw = String(formData.get("openingBalance") ?? "").trim();
  const openingBalancePaise = openingRaw === "" ? 0 : rupeesToPaise(openingRaw);
  if (openingBalancePaise === null) {
    return { error: "Enter the opening balance as a number, or leave it blank." };
  }

  const floatRaw = String(formData.get("float") ?? "").trim();
  const floatPaise = floatRaw === "" ? null : rupeesToPaise(floatRaw);
  if (floatRaw !== "" && floatPaise === null) {
    return { error: "Enter the petty cash float as a number, or leave it blank." };
  }

  const accountId = String(formData.get("accountId") ?? "").trim();
  const supabase = await createClient();

  // Through the RLS client, so the finance_accounts policies are the thing
  // that decides — unlike the ledger writes, no transaction spans these.
  const values = {
    name: parsed.data.name,
    center_id: parsed.data.centerId,
    type: parsed.data.type,
    opening_balance_paise: openingBalancePaise,
    float_paise: parsed.data.type === "petty_cash" ? floatPaise : null,
    is_active: formData.get("isActive") === "on",
    updated_at: new Date().toISOString(),
  };

  const { error } = accountId
    ? await supabase.from("finance_accounts").update(values).eq("id", accountId)
    : await supabase.from("finance_accounts").insert(values);

  if (error) {
    // The unique index on name is the likely one, and its raw message is
    // not something to put in front of an accountant.
    return {
      error: error.message.includes("finance_accounts_name_uq")
        ? "An account with that name already exists."
        : error.message,
    };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: accountId ? "finance_account.update" : "finance_account.create",
    entityType: "finance_accounts",
    entityId: accountId || undefined,
    after: values,
  });

  revalidatePath("/finance/accounts");
  revalidateFinance();
  return { success: accountId ? "Account saved." : "Account created." };
}
