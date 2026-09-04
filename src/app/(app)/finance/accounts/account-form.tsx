"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveAccount, type FinanceFormState } from "@/lib/finance/actions";

const initialState: FinanceFormState = {};

export interface EditableAccount {
  id: string;
  name: string;
  centerId: string;
  type: "bank" | "cash" | "petty_cash";
  openingBalancePaise: number;
  floatPaise: number | null;
  isActive: boolean;
}

/**
 * One form for both adding and editing.
 *
 * Picking an existing account loads it in place rather than opening a
 * second screen: an accountant setting up opening balances is going
 * through the whole list in one sitting, and a page load per row is a
 * page load per row.
 *
 * Plain `<select>`s rather than the styled picker used elsewhere — this
 * form rebuilds its own state when the selection changes, and a
 * controlled native select is the honest way to do that.
 */
export function AccountForm({
  centers,
  accounts,
}: {
  centers: Array<{ id: string; name: string }>;
  accounts: EditableAccount[];
}) {
  const [state, action, pending] = useActionState(saveAccount, initialState);
  const [editingId, setEditingId] = useState("");

  const editing = accounts.find((a) => a.id === editingId);
  const type = editing?.type ?? "bank";
  const [showFloat, setShowFloat] = useState(type === "petty_cash");

  // Keyed on the selection so every field resets to the chosen account's
  // values — otherwise React keeps the previous row's text in the inputs.
  return (
    <form key={editingId} action={action} className="flex max-w-2xl flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="editing">Editing</Label>
        <select
          id="editing"
          className="h-9 rounded-md border bg-transparent px-3 text-sm"
          value={editingId}
          onChange={(e) => {
            setEditingId(e.target.value);
            const next = accounts.find((a) => a.id === e.target.value);
            setShowFloat((next?.type ?? "bank") === "petty_cash");
          }}
        >
          <option value="">➕ New account</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </div>

      <input type="hidden" name="accountId" value={editingId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Account name</Label>
          <Input
            id="name"
            name="name"
            defaultValue={editing?.name ?? ""}
            placeholder="Kannur — Federal Bank"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="centerId">Centre</Label>
          <select
            id="centerId"
            name="centerId"
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
            defaultValue={editing?.centerId ?? centers[0]?.id ?? ""}
            required
          >
            {centers.map((center) => (
              <option key={center.id} value={center.id}>
                {center.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="type">Type</Label>
          <select
            id="type"
            name="type"
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
            defaultValue={type}
            onChange={(e) => setShowFloat(e.target.value === "petty_cash")}
          >
            <option value="bank">Bank</option>
            <option value="cash">Cash</option>
            <option value="petty_cash">Petty cash</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="openingBalance">Opening balance (₹)</Label>
          <Input
            id="openingBalance"
            name="openingBalance"
            defaultValue={
              editing ? String(editing.openingBalancePaise / 100) : ""
            }
            placeholder="0"
          />
          <p className="text-xs text-muted-foreground">
            The balance on the day the CRM took over. Everything after it comes from the ledger.
          </p>
        </div>
      </div>

      {showFloat && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="float">Petty cash float (₹)</Label>
          <Input
            id="float"
            name="float"
            defaultValue={editing?.floatPaise ? String(editing.floatPaise / 100) : ""}
            placeholder="5000"
          />
          <p className="text-xs text-muted-foreground">
            The amount this box is topped up to. Below a fifth of it, the dashboard flags it.
          </p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Checkbox id="isActive" name="isActive" defaultChecked={editing?.isActive ?? true} />
        <Label htmlFor="isActive" className="font-normal">
          Active — can be posted to
        </Label>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save account" : "Create account"}
        </Button>
        <FormMessage error={state.error} success={state.success} />
      </div>
    </form>
  );
}
