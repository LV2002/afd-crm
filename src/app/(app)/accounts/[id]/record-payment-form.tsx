"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/smart-inputs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { recordPaymentAction, type FormState } from "./actions";

const initialState: FormState = {};

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "neft", label: "NEFT" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

export function RecordPaymentForm({
  enrolmentId,
  accounts,
}: {
  enrolmentId: string;
  /** Active finance accounts the money could have landed in. */
  accounts: Array<{ id: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState(recordPaymentAction.bind(null, enrolmentId), initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">Record a payment</h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="payment-amount">Amount</Label>
          <MoneyInput id="payment-amount" name="amount" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="payment-method">Method</Label>
          <Select name="method" required>
            <SelectTrigger id="payment-method">
              <SelectValue placeholder="Select method" />
            </SelectTrigger>
            <SelectContent>
              {METHODS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {accounts.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="payment-account">Received into</Label>
          {/*
            The cash side of the receipt. Posting it here means a student's
            receipt and the institute's bank balance come from one write —
            they cannot end up disagreeing. Native select rather than the
            styled one: this form has no client state and does not need any.
          */}
          <select
            id="payment-account"
            name="accountId"
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
            required
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="payment-reference">Reference (optional)</Label>
        <Input id="payment-reference" name="reference" placeholder="UTR / cheque no. / transaction id" />
      </div>

      <FormMessage error={state.error} success={state.success} />
      {/* Asked before, not after. The ledger is append-only: a payment
          recorded by a mis-click cannot be edited away, only reversed
          with a second line — and the first cleared payment is the gate
          that creates a student record and hands the family to
          academics. Both are worth one deliberate press. */}
      <ConfirmSubmit
        label="Record payment"
        pending={pending}
        pendingLabel="Recording…"
        title="Record this payment?"
        body={
          <>
            This writes a permanent line in the ledger. It cannot be edited or deleted
            afterwards — a mistake has to be corrected with a reversal, which stays on the
            record alongside it.
            <br />
            <br />
            If this is their first cleared payment it also creates their student record and
            hands them to academics.
          </>
        }
        confirmLabel="Yes, record it"
      />
    </form>
  );
}
