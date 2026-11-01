"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  importLines,
  previewStatement,
  type BankFormState,
  type PreviewState,
} from "@/lib/finance/bank-actions";
import { formatINR } from "@/lib/format/currency";

const previewInitial: PreviewState = {};
const importInitial: BankFormState = {};

export function ImportPanel({ accounts }: { accounts: Array<{ id: string; name: string }> }) {
  const [previewState, previewAction, previewing] = useActionState(previewStatement, previewInitial);
  const [importState, importAction, importing] = useActionState(importLines, importInitial);
  const preview = previewState.preview;
  const imported = Boolean(importState.success);

  return (
    <section className="flex max-w-3xl flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Import a bank statement</h2>
        <p className="text-sm text-muted-foreground">
          Upload the CSV your bank gives you. Only transactions the CRM hasn&apos;t seen are added,
          so overlapping statements are fine.{" "}
          <strong className="font-medium text-foreground">The file itself is never saved</strong> —
          it is read, and discarded when this page finishes.
        </p>
      </div>

      <form action={previewAction} className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bank-account">Bank account</Label>
          <select
            id="bank-account"
            name="accountId"
            required
            defaultValue={accounts.length === 1 ? accounts[0].id : ""}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            {accounts.length > 1 && <option value="">Choose…</option>}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bank-file">Statement (CSV)</Label>
          <input
            id="bank-file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
          />
        </div>
        <Button type="submit" disabled={previewing}>
          {previewing ? "Reading…" : "Check statement"}
        </Button>
        <FormMessage error={previewState.error} />
      </form>

      {preview && !imported && (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
          <p className="text-sm">
            <span className="font-medium">{preview.fileName}</span>
            {preview.from && preview.to && (
              <span className="text-muted-foreground">
                {" "}
                · {preview.from} to {preview.to}
              </span>
            )}
          </p>

          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="New transactions" value={String(preview.fresh.length)} strong />
            <Stat label="Already imported" value={String(preview.alreadyHave)} />
            <Stat label="Money in (new)" value={formatINR(preview.inPaise)} />
            <Stat label="Money out (new)" value={formatINR(preview.outPaise)} />
          </dl>

          {preview.guessedDates > 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {preview.guessedDates} line{preview.guessedDates === 1 ? "" : "s"} had an impossible
              year in the file (like 0202). The year was taken from the lines around{" "}
              {preview.guessedDates === 1 ? "it" : "them"} — they&apos;re marked in the list so you
              can check.
            </p>
          )}
          {preview.mismatchRows.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {preview.mismatchRows.length} line{preview.mismatchRows.length === 1 ? "" : "s"}{" "}
              don&apos;t follow on from the balance before {preview.mismatchRows.length === 1 ? "it" : "them"}.
              Banks often list same-day lines in a different order, so this is usually harmless —
              but if it looks like a lot, check the file (first few rows:{" "}
              {preview.mismatchRows.slice(0, 5).join(", ")}).
            </p>
          )}
          {preview.skipped.length > 0 && (
            <details className="text-sm text-muted-foreground">
              <summary className="cursor-pointer">
                {preview.skipped.length} row{preview.skipped.length === 1 ? "" : "s"} left out
                (headings, totals, blank lines)
              </summary>
              <ul className="mt-2 max-h-40 overflow-auto pl-4">
                {preview.skipped.slice(0, 100).map((s) => (
                  <li key={s.row}>
                    Row {s.row}: {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {preview.fresh.length > 0 ? (
            <form action={importAction} className="flex items-center gap-3">
              <input
                type="hidden"
                name="payload"
                value={JSON.stringify({ accountId: preview.accountId, lines: preview.fresh })}
              />
              <Button type="submit" disabled={importing}>
                {importing
                  ? "Importing…"
                  : `Import ${preview.fresh.length} new transaction${preview.fresh.length === 1 ? "" : "s"}`}
              </Button>
              <FormMessage error={importState.error} />
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing new — every line in this file is already in the CRM.
            </p>
          )}
        </div>
      )}

      {imported && (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          <FormMessage success={importState.success} /> Categorise them below.
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={strong ? "text-lg font-semibold" : "text-lg"}>{value}</dd>
    </div>
  );
}
