"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import {
  confirmBankBalance,
  countCash,
  matchLine,
  runMatching,
  undoPair,
  waiveStatementLine,
  type ReconcileFormState,
} from "@/lib/finance/reconcile-actions";

const initial: ReconcileFormState = {};

/** One suggested pairing: a single button, because the amounts already agree exactly. */
export function PairButton({
  bankLineId,
  transactionId,
  label,
}: {
  bankLineId: string;
  transactionId: string;
  label: string;
}) {
  const [state, action, pending] = useActionState(matchLine, initial);
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="bankLineId" value={bankLineId} />
      <input type="hidden" name="transactionId" value={transactionId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="h-auto justify-start py-1 text-left text-xs">
        {pending ? "Pairing…" : label}
      </Button>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}

/** A reason is required, in a few words, and is kept with who gave it. */
export function ReasonForm({
  kind,
  idName,
  id,
  button,
  placeholder,
}: {
  kind: "waive" | "undo";
  idName: "bankLineId" | "matchId";
  id: string;
  button: string;
  placeholder: string;
}) {
  const [state, action, pending] = useActionState(kind === "waive" ? waiveStatementLine : undoPair, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name={idName} value={id} />
      <input
        name="reason"
        required
        minLength={5}
        placeholder={placeholder}
        className="h-8 w-56 rounded-md border bg-background px-2 text-xs"
      />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "…" : button}
      </Button>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}

export function RunMatchingButton({ accountId, name }: { accountId: string; name: string }) {
  const [state, action, pending] = useActionState(runMatching, initial);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="accountId" value={accountId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Matching…" : `Match ${name}`}
      </Button>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

/** The balance read off the bank's own app, to be set against the statement. */
export function BankBalanceForm({ accountId }: { accountId: string }) {
  const [state, action, pending] = useActionState(confirmBankBalance, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="accountId" value={accountId} />
      <input name="asOf" type="date" required defaultValue={today()} className="h-8 rounded-md border bg-background px-2 text-xs" />
      <input name="balance" required inputMode="decimal" placeholder="Balance in the bank app ₹" className="h-8 w-44 rounded-md border bg-background px-2 text-xs" />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "…" : "Check"}
      </Button>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}

/** A count of the physical cash. A difference needs a few words of explanation. */
export function CashCountForm({ accountId }: { accountId: string }) {
  const [state, action, pending] = useActionState(countCash, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="accountId" value={accountId} />
      <input name="countedOn" type="date" required defaultValue={today()} className="h-8 rounded-md border bg-background px-2 text-xs" />
      <input name="counted" required inputMode="decimal" placeholder="Cash counted ₹" className="h-8 w-36 rounded-md border bg-background px-2 text-xs" />
      <input name="note" placeholder="If different, why" className="h-8 w-44 rounded-md border bg-background px-2 text-xs" />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "…" : "Record count"}
      </Button>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}
