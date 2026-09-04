"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { correctEntry, reverseEntry, type FinanceFormState } from "@/lib/finance/actions";

const initialState: FinanceFormState = {};

/**
 * Reverse or correct one entry, opened from its own row.
 *
 * Both start from the row you are looking at, so neither asks anybody to
 * copy an entry number across from somewhere else — which is where the
 * spreadsheet's version went wrong most often.
 *
 * Correction leaves every field blank on purpose: a blank means "keep what
 * is there". Pre-filling the current values would make it impossible to
 * tell an unchanged field from a deliberately re-entered one.
 */
export function EntryActions({
  transactionId,
  txnNo,
  accounts,
}: {
  transactionId: string;
  txnNo: number;
  accounts: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState<"none" | "reverse" | "correct">("none");

  if (open === "none") {
    return (
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={() => setOpen("correct")}>
          Correct
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen("reverse")}>
          Reverse
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-muted/30 p-3 text-left">
      {open === "reverse" ? (
        <ReverseForm transactionId={transactionId} txnNo={txnNo} onClose={() => setOpen("none")} />
      ) : (
        <CorrectForm
          transactionId={transactionId}
          txnNo={txnNo}
          accounts={accounts}
          onClose={() => setOpen("none")}
        />
      )}
    </div>
  );
}

function ReverseForm({
  transactionId,
  txnNo,
  onClose,
}: {
  transactionId: string;
  txnNo: number;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(reverseEntry, initialState);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="transactionId" value={transactionId} />
      <p className="text-sm font-medium">Reverse entry #{txnNo}</p>
      <Label htmlFor={`reason-${transactionId}`} className="text-xs font-normal">
        Why? This is stored beside the reversal.
      </Label>
      <Input
        id={`reason-${transactionId}`}
        name="reason"
        placeholder="Paid twice by mistake"
        required
      />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Reversing…" : "Reverse"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}

function CorrectForm({
  transactionId,
  txnNo,
  accounts,
  onClose,
}: {
  transactionId: string;
  txnNo: number;
  accounts: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(correctEntry, initialState);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="transactionId" value={transactionId} />
      <p className="text-sm font-medium">Correct entry #{txnNo}</p>
      <p className="text-xs text-muted-foreground">
        Leave a field blank to keep it as it is. The original is reversed and a corrected entry
        posted in its place.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs font-normal">Corrected date</Label>
          <Input type="date" name="occurredOn" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs font-normal">Corrected amount (₹)</Label>
          <Input name="amount" placeholder="50000" />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs font-normal">Corrected account</Label>
        <select name="accountId" className="h-9 rounded-md border bg-transparent px-3 text-sm">
          <option value="">Keep the current account</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs font-normal">What was wrong?</Label>
        <Input name="reason" placeholder="Typed 5,000 instead of 50,000" required />
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Correcting…" : "Correct"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}
