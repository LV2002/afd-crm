"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { bankStatementLines } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

import { assertAccountInScope } from "./account-scope";
import { parseBankStatement, type StatementLine } from "./bank-statement";
import { SKIP_REASONS } from "./bank-constants";
import { getFinanceCategories } from "./get-finance";
import { resolveBankLines, saveStatementLines } from "./bank-ledger";

/**
 * Bank statement import and categorising.
 *
 * Two steps, and the file is only ever present for the first one. `preview`
 * reads the upload in memory and answers "what would this add?"; it saves
 * nothing. `importLines` then receives the lines (not the file) and saves
 * the new ones. Neither writes the upload anywhere — not Storage, not disk,
 * not the database — which is what Leon asked for twice over: no space to
 * keep statements, and a statement is a security risk to hold.
 */

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_LINES = 5000;

export interface ImportPreview {
  accountId: string;
  fileName: string;
  /** Lines not seen before. These are what "Import" will save. */
  fresh: StatementLine[];
  alreadyHave: number;
  skipped: Array<{ row: number; reason: string }>;
  mismatchRows: number[];
  guessedDates: number;
  from: string | null;
  to: string | null;
  inPaise: number;
  outPaise: number;
}

export interface PreviewState {
  error?: string;
  preview?: ImportPreview;
}

export interface BankFormState {
  error?: string;
  success?: string;
}

function revalidateBank(): void {
  revalidatePath("/finance");
  revalidatePath("/finance/bank");
  revalidatePath("/finance/transactions");
  revalidatePath("/finance/ledger");
  revalidatePath("/finance/reports");
}

export async function previewStatement(
  _prev: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) return { error: "Pick which bank account this statement is for." };

  const scope = await assertAccountInScope(accountId, "finance.record");
  if (!scope.ok) return { error: scope.error };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the statement file." };
  if (file.size > MAX_FILE_BYTES) return { error: "That file is over 3 MB — export a shorter period." };
  if (/\.(xlsx?|pdf)$/i.test(file.name)) {
    return {
      error:
        "Upload the statement as CSV. In Excel use File → Save As → CSV; most bank portals have a CSV download beside the PDF.",
    };
  }

  // Read straight into a string. The File object lives only in this request.
  const parsed = parseBankStatement(await file.text());
  if (parsed.error) return { error: parsed.error };
  if (parsed.lines.length === 0) return { error: "No transactions were found in that file." };
  if (parsed.lines.length > MAX_LINES) {
    return { error: `That's ${parsed.lines.length} lines — please upload at most ${MAX_LINES} at a time.` };
  }

  const known = new Set(await existingFingerprints(accountId, parsed.lines.map((l) => l.fingerprint)));
  const fresh = parsed.lines.filter((l) => !known.has(l.fingerprint));
  const dates = parsed.lines.map((l) => l.occurredOn).sort();

  return {
    preview: {
      accountId,
      fileName: file.name,
      fresh,
      alreadyHave: parsed.lines.length - fresh.length,
      skipped: parsed.skipped,
      mismatchRows: parsed.mismatchRows,
      guessedDates: fresh.filter((l) => l.dateGuessed).length,
      from: dates[0] ?? null,
      to: dates.at(-1) ?? null,
      inPaise: fresh.filter((l) => l.direction === "in").reduce((s, l) => s + l.amountPaise, 0),
      outPaise: fresh.filter((l) => l.direction === "out").reduce((s, l) => s + l.amountPaise, 0),
    },
  };
}

async function existingFingerprints(accountId: string, fingerprints: string[]): Promise<string[]> {
  const found: string[] = [];
  // Chunked so a long statement doesn't build an enormous IN list.
  for (let i = 0; i < fingerprints.length; i += 500) {
    const rows = await db
      .select({ fingerprint: bankStatementLines.fingerprint })
      .from(bankStatementLines)
      .where(
        and(
          eq(bankStatementLines.accountId, accountId),
          inArray(bankStatementLines.fingerprint, fingerprints.slice(i, i + 500)),
        ),
      );
    found.push(...rows.map((r) => r.fingerprint));
  }
  return found;
}

const lineSchema = z.object({
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  particulars: z.string().min(1).max(1000),
  direction: z.enum(["in", "out"]),
  amountPaise: z.number().int().positive(),
  balancePaise: z.number().int().nullable(),
  note: z.string().max(2000).nullable(),
  dateGuessed: z.boolean(),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
});

const importSchema = z.object({
  accountId: z.string().uuid(),
  lines: z.array(lineSchema).min(1).max(MAX_LINES),
});

export async function importLines(
  _prev: BankFormState,
  formData: FormData,
): Promise<BankFormState> {
  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "That preview has expired — upload the file again." };
  }
  const parsed = importSchema.safeParse(payload);
  if (!parsed.success) return { error: "That preview has expired — upload the file again." };

  const scope = await assertAccountInScope(parsed.data.accountId, "finance.record");
  if (!scope.ok) return { error: scope.error };
  const user = await getCurrentUser();

  const inserted = await saveStatementLines(db, {
    accountId: parsed.data.accountId,
    centerId: scope.centerId,
    importedBy: user?.id ?? null,
    lines: parsed.data.lines,
  });

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user!.id,
    action: "finance.bank_import",
    entityType: "bank_statement_lines",
    entityId: parsed.data.accountId,
    after: { offered: parsed.data.lines.length, saved: inserted },
  });

  revalidateBank();
  const dupes = parsed.data.lines.length - inserted;
  return {
    success:
      `${inserted} new transaction${inserted === 1 ? "" : "s"} added to the list below.` +
      (dupes > 0 ? ` ${dupes} were already there.` : ""),
  };
}

const resolveSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "Tick at least one transaction.").max(1000),
  // Either a category label to post under, or a skip reason key.
  choice: z.string().trim().min(1, "Pick a category."),
});

/**
 * Categorises the chosen lines, all credits or all debits at once.
 *
 * Posting a line appends to the ledger and flips the line to `posted` in the
 * same transaction. The flip is conditional on the line still being
 * `pending`, so a second accountant clicking the same line a moment later
 * posts nothing rather than counting the money twice.
 */
export async function categoriseLines(
  _prev: BankFormState,
  formData: FormData,
): Promise<BankFormState> {
  const parsed = resolveSchema.safeParse({
    ids: formData.getAll("ids").map(String),
    choice: String(formData.get("choice") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const lines = await db
    .select()
    .from(bankStatementLines)
    .where(
      and(inArray(bankStatementLines.id, parsed.data.ids), eq(bankStatementLines.status, "pending")),
    );
  if (lines.length === 0) return { error: "Those were already dealt with." };

  const directions = new Set(lines.map((l) => l.direction));
  if (directions.size > 1) {
    return { error: "Credits and debits can't be categorised together — tick one kind at a time." };
  }
  const direction = lines[0].direction === "in" ? "in" : "out";

  for (const accountId of new Set(lines.map((l) => l.accountId))) {
    const scope = await assertAccountInScope(accountId, "finance.record");
    if (!scope.ok) return { error: scope.error };
  }

  const skipReason = parsed.data.choice.startsWith("skip:")
    ? SKIP_REASONS[parsed.data.choice.slice(5)]
    : null;
  if (parsed.data.choice.startsWith("skip:") && !skipReason) return { error: "Pick a category." };

  const supabase = await createClient();
  const user = await getCurrentUser();

  if (!skipReason) {
    const categories = await getFinanceCategories(supabase);
    const allowed = (direction === "in" ? categories.income : categories.expense).map((c) => c.label);
    if (!allowed.includes(parsed.data.choice)) {
      return { error: `"${parsed.data.choice}" isn't a ${direction === "in" ? "income" : "expense"} category.` };
    }
  }

  const done = await db.transaction((tx) =>
    resolveBankLines(tx, {
      lines,
      direction,
      choice: parsed.data.choice,
      skipReason,
      userId: user?.id ?? null,
    }),
  );

  await writeAuditLog(supabase, {
    actorId: user!.id,
    action: skipReason ? "finance.bank_skip" : "finance.bank_categorise",
    entityType: "bank_statement_lines",
    entityId: lines[0].id,
    after: { count: done, choice: skipReason ?? parsed.data.choice },
  });

  revalidateBank();
  return {
    success: skipReason
      ? `${done} set aside — ${skipReason}.`
      : `${done} recorded under ${parsed.data.choice}.`,
  };
}
