"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  recordExpense,
  recordOtherIncome,
  recordTransfer,
  type FinanceFormState,
} from "@/lib/finance/actions";

const initialState: FinanceFormState = {};

interface Option {
  value: string;
  label: string;
}

type Tab = "expense" | "income" | "transfer";

export function RecordForms({
  accounts,
  expenseCategories,
  incomeCategories,
}: {
  accounts: Array<{ id: string; name: string }>;
  expenseCategories: Option[];
  incomeCategories: Option[];
}) {
  const [tab, setTab] = useState<Tab>("expense");

  if (accounts.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        There are no active accounts to post to yet. An admin sets those up under Accounts.
      </p>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex gap-1">
        <TabButton active={tab === "expense"} onClick={() => setTab("expense")}>
          Expense
        </TabButton>
        <TabButton active={tab === "income"} onClick={() => setTab("income")}>
          Other income
        </TabButton>
        <TabButton active={tab === "transfer"} onClick={() => setTab("transfer")}>
          Transfer
        </TabButton>
      </div>

      {tab === "expense" && (
        <EntryForm
          action={recordExpense}
          accounts={accounts}
          categories={expenseCategories}
          accountLabel="Paid from"
          referenceLabel="Reference / bill no."
          submitLabel="Record expense"
          hint="Salaries, rent, electricity, ads — anything the institute pays out."
        />
      )}

      {tab === "income" && (
        <EntryForm
          action={recordOtherIncome}
          accounts={accounts}
          categories={incomeCategories}
          accountLabel="Received into"
          referenceLabel="Reference / invoice no."
          submitLabel="Record income"
          hint={
            <>
              Income that is <strong>not</strong> student fees — study material, test series,
              workshops. Fees are recorded against the enrolment so they get a receipt number.
            </>
          }
        />
      )}

      {tab === "transfer" && <TransferForm accounts={accounts} />}

      <p className="text-xs text-muted-foreground">
        Categories come from{" "}
        <Link href="/settings/dropdowns" className="underline">
          Settings → Dropdowns
        </Link>
        . Add or rename them there and they appear here immediately.
      </p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-md bg-secondary px-3 py-1.5 text-sm font-medium"
          : "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/50"
      }
    >
      {children}
    </button>
  );
}

function EntryForm({
  action,
  accounts,
  categories,
  accountLabel,
  referenceLabel,
  submitLabel,
  hint,
}: {
  action: (state: FinanceFormState, formData: FormData) => Promise<FinanceFormState>;
  accounts: Array<{ id: string; name: string }>;
  categories: Option[];
  accountLabel: string;
  referenceLabel: string;
  submitLabel: string;
  hint: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const today = new Date().toISOString().slice(0, 10);

  return (
    // Keyed on the success message so a saved form clears itself, ready
    // for the next entry — an accountant posting a month of bills should
    // not have to clear six fields by hand each time.
    <form key={state.success ?? "new"} action={formAction} className="flex flex-col gap-4 rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{hint}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="occurredOn">Date</Label>
          <Input id="occurredOn" name="occurredOn" type="date" defaultValue={today} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="amount">Amount (₹)</Label>
          <Input id="amount" name="amount" placeholder="12,500" required />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="category">Category</Label>
        <select
          id="category"
          name="category"
          className="h-9 rounded-md border bg-transparent px-3 text-sm"
          required
        >
          <option value="">Pick one…</option>
          {categories.map((category) => (
            // The LABEL is stored, not the key: it is what appears on
            // every report, and a report that reads "meta_ads" is not a
            // report anybody wants to hand their accountant.
            <option key={category.value} value={category.label}>
              {category.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Input id="description" name="description" placeholder="September electricity bill" required />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="accountId">{accountLabel}</Label>
          <select
            id="accountId"
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
        <div className="flex flex-col gap-2">
          <Label htmlFor="reference">{referenceLabel}</Label>
          <Input id="reference" name="reference" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <FormMessage error={state.error} success={state.success} />
      </div>
    </form>
  );
}

function TransferForm({ accounts }: { accounts: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState(recordTransfer, initialState);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form key={state.success ?? "new"} action={action} className="flex flex-col gap-4 rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">
        Moving money between your own accounts — a bank withdrawal into the cash box, or topping up
        petty cash. Transfers are never counted as income or expense, so they cannot inflate a
        month.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="transferDate">Date</Label>
          <Input id="transferDate" name="occurredOn" type="date" defaultValue={today} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="transferAmount">Amount (₹)</Label>
          <Input id="transferAmount" name="amount" placeholder="20,000" required />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="fromAccountId">From</Label>
          <select
            id="fromAccountId"
            name="fromAccountId"
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
        <div className="flex flex-col gap-2">
          <Label htmlFor="toAccountId">To</Label>
          <select
            id="toAccountId"
            name="toAccountId"
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
            defaultValue={accounts[1]?.id ?? accounts[0]?.id}
            required
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="transferDescription">Description</Label>
        <Input id="transferDescription" name="description" placeholder="Cash withdrawal for petty cash" />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Moving…" : "Record transfer"}
        </Button>
        <FormMessage error={state.error} success={state.success} />
      </div>
    </form>
  );
}
