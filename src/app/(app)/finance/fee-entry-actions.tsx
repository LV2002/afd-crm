"use client";

import { useActionState, useState } from "react";

import { reversePaymentAction } from "@/app/(app)/accounts/[id]/actions";
import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: { error?: string; success?: string } = {};

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "neft", label: "NEFT" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

/**
 * Undo a fee payment from its own row in the ledger.
 *
 * A fee entry's cash side belongs to a receipt in the payments ledger, so
 * reversing it as a plain entry would leave the two disagreeing — which is why
 * the ledger offered nothing on these rows, and why somebody looking to take a
 * test payment out found no way to. This goes through the payment's own
 * reversal (the same action as Accounts → student → Reverse or refund a
 * payment), which writes the opposite entry in BOTH ledgers together.
 *
 * Two outcomes, as there: a **reversal** (it should never have been recorded;
 * undone at its original date) or a **refund** (the money goes back to the
 * family; a new outgoing entry today, which needs a method and an account).
 */
export function FeeEntryActions({
  enrolmentId,
  paymentId,
  txnNo,
  accounts,
}: {
  enrolmentId: string;
  paymentId: string;
  txnNo: number;
  accounts: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"reversal" | "refund">("reversal");
  const [state, action, pending] = useActionState(reversePaymentAction.bind(null, enrolmentId), initialState);

  if (!open) {
    return (
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
          Reverse
        </Button>
      </div>
    );
  }

  const isRefund = kind === "refund";

  return (
    <form action={action} className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3 text-left">
      <input type="hidden" name="paymentId" value={paymentId} />
      <p className="text-sm font-medium">Reverse entry #{txnNo}</p>
      <p className="text-xs text-muted-foreground">
        Nothing is deleted. The original stays on the record and a mirror entry is added.
      </p>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`kind-${paymentId}`} className="text-xs font-normal">
          What happened
        </Label>
        <select
          id={`kind-${paymentId}`}
          name="kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as "reversal" | "refund")}
          className="h-9 rounded-md border bg-transparent px-2 text-sm"
        >
          <option value="reversal">Reversal — it should never have been recorded</option>
          <option value="refund">Refund — the money is going back to the family</option>
        </select>
      </div>

      {isRefund && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`method-${paymentId}`} className="text-xs font-normal">
              Paid back by
            </Label>
            <select
              id={`method-${paymentId}`}
              name="method"
              required
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
            >
              {METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </div>
          {accounts.length > 0 && (
            <div className="flex flex-col gap-1">
              <Label htmlFor={`account-${paymentId}`} className="text-xs font-normal">
                Paid from
              </Label>
              <select
                id={`account-${paymentId}`}
                name="accountId"
                required
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
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

      <div className="flex flex-col gap-1">
        <Label htmlFor={`reason-${paymentId}`} className="text-xs font-normal">
          Why
        </Label>
        <Input id={`reason-${paymentId}`} name="reason" required placeholder="Test payment from the workflow trial" />
      </div>

      <FormMessage error={state.error} success={state.success} />

      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="destructive" disabled={pending}>
          {pending ? "Reversing…" : isRefund ? "Record refund" : "Reverse payment"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
