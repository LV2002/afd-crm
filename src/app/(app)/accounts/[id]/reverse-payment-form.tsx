"use client";

import { Undo2 } from "lucide-react";
import { useActionState, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatINR } from "@/lib/format/currency";

import { reversePaymentAction, type FormState } from "./actions";

const initialState: FormState = {};

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "neft", label: "NEFT" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

export interface ReversiblePayment {
  id: string;
  amountPaise: number;
  receivedOn: string;
  receiptNo: number | null;
}

/**
 * Undoing a payment — the half of the append-only ledger that was
 * specified, permissioned, printable and unbuildable.
 *
 * The form insists on the distinction the accounting depends on, because
 * nobody will volunteer it. "Reversal" and "refund" look like synonyms to
 * everyone except the person reconciling a bank statement, for whom one
 * means the day's takings were overstated and the other means money left
 * the account today.
 */
export function ReversePaymentForm({
  enrolmentId,
  payments,
  accounts,
}: {
  enrolmentId: string;
  /** Credits with no reversal against them yet. */
  payments: ReversiblePayment[];
  accounts: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(
    reversePaymentAction.bind(null, enrolmentId),
    initialState,
  );
  const [kind, setKind] = useState("reversal");

  if (payments.length === 0) return null;

  const isRefund = kind === "refund";

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">Reverse or refund a payment</h3>
      <p className="text-xs text-muted-foreground">
        Nothing is deleted. The original payment stays on the record with this note beside it.
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="reverse-payment">Payment</Label>
        <Combobox
          id="reverse-payment"
          name="paymentId"
          required
          options={payments.map((payment) => ({
            value: payment.id,
            label: `${formatINR(payment.amountPaise)} — ${payment.receivedOn}${
              payment.receiptNo === null ? "" : ` (receipt #${payment.receiptNo})`
            }`,
          }))}
          placeholder="Select the payment"
          searchPlaceholder="Type to search…"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="reverse-kind">What happened</Label>
        <Combobox
          id="reverse-kind"
          name="kind"
          required
          value={kind}
          onChange={setKind}
          options={[
            { value: "reversal", label: "Reversal — it should never have been recorded" },
            { value: "refund", label: "Refund — the money is going back to the family" },
          ]}
        />
        <p className="text-xs text-muted-foreground">
          {isRefund
            ? "The original payment stands. A new outgoing entry is posted today, because that is when the cash leaves."
            : "No money ever moved, so the cash entry it created is undone at its original date."}
        </p>
      </div>

      {isRefund && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="reverse-method">Paid back by</Label>
            <Combobox
              id="reverse-method"
              name="method"
              required
              options={METHODS}
              placeholder="Select method"
              searchPlaceholder="Type to search…"
            />
          </div>
          {accounts.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="reverse-account">Paid from</Label>
              <select
                id="reverse-account"
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
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="reverse-reason">Reason</Label>
        <Input
          id="reverse-reason"
          name="reason"
          required
          placeholder="Entered against the wrong student"
        />
        <p className="text-xs text-muted-foreground">
          Prints on the note the family gets, so write it for them.
        </p>
      </div>

      <FormMessage error={state.error} success={state.success} />

      <ConfirmSubmit
        label={isRefund ? "Record refund" : "Reverse payment"}
        icon={<Undo2 className="size-4" />}
        variant="destructive"
        pending={pending}
        pendingLabel="Recording…"
        title={isRefund ? "Record this refund?" : "Reverse this payment?"}
        body={
          <>
            This writes a permanent line in the ledger beside the original, which stays exactly as
            it is. It cannot be edited or deleted afterwards, and a payment can only be undone
            once.
            <br />
            <br />
            The student&apos;s balance goes back up, and accounts, the centre head and their
            counsellor are told.
          </>
        }
        confirmLabel={isRefund ? "Yes, record it" : "Yes, reverse it"}
      />
    </form>
  );
}
