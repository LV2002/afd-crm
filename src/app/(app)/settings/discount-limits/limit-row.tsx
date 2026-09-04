"use client";

import { Save } from "lucide-react";
import { useActionState, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveDiscountLimit, type DiscountLimitState } from "./actions";

const initialState: DiscountLimitState = {};

/**
 * One role's ceiling. Each row saves on its own — an admin changing what a
 * counsellor may give should not have to re-submit every other role, and a
 * mistake in one row cannot take the rest with it.
 */
export function LimitRow({
  roleId,
  roleName,
  roleDescription,
  maxPercent,
  maxAmount,
  isUnlimited,
}: {
  roleId: string;
  roleName: string;
  roleDescription: string | null;
  maxPercent: string;
  maxAmount: string;
  isUnlimited: boolean;
}) {
  const [state, action, pending] = useActionState(saveDiscountLimit, initialState);
  const [unlimited, setUnlimited] = useState(isUnlimited);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border p-4">
      <input type="hidden" name="roleId" value={roleId} />

      <div>
        <p className="text-sm font-semibold">{roleName}</p>
        {roleDescription && <p className="text-xs text-muted-foreground">{roleDescription}</p>}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground" htmlFor={`percent-${roleId}`}>
            Up to % of the fee
          </Label>
          <Input
            id={`percent-${roleId}`}
            name="maxPercent"
            type="number"
            min="0"
            max="100"
            step="1"
            className="h-9 w-32"
            defaultValue={maxPercent}
            disabled={unlimited}
            placeholder="—"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground" htmlFor={`amount-${roleId}`}>
            and up to ₹
          </Label>
          <Input
            id={`amount-${roleId}`}
            name="maxAmount"
            type="number"
            min="0"
            step="1"
            className="h-9 w-36"
            defaultValue={maxAmount}
            disabled={unlimited}
            placeholder="—"
          />
        </div>

        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            name="isUnlimited"
            className="size-4"
            defaultChecked={isUnlimited}
            onChange={(event) => setUnlimited(event.target.checked)}
          />
          No limit
        </label>

        <Button type="submit" size="sm" disabled={pending} className="mb-0.5">
          <Save className="size-4" /> {pending ? "Saving…" : "Save"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Both limits apply when both are set — a discount has to be under the percentage{" "}
        <em>and</em> under the cash figure. Leave one blank to use only the other.
      </p>

      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}
