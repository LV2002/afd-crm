"use client";

import { AlertTriangle, Check, X } from "lucide-react";
import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { decideDiscount, type DiscountDecisionState } from "@/lib/enrolment/discount-actions";
import { formatINR } from "@/lib/format/currency";

const initialState: DiscountDecisionState = {};

/**
 * A discount somebody asked for and could not give themselves.
 *
 * Shown to everybody who can see the fee plan, not only to approvers —
 * the counsellor who asked needs to know it is still outstanding, and
 * accounts need to know why the fee on screen is higher than the one the
 * student was told. Only somebody holding `discount.approve` gets the
 * buttons.
 */
export function PendingDiscount({
  enrolmentId,
  pendingPaise,
  requestedBy,
  requestedAt,
  totalFeePaise,
  canDecide,
}: {
  enrolmentId: string;
  pendingPaise: number;
  requestedBy: string | null;
  requestedAt: string | null;
  totalFeePaise: number;
  canDecide: boolean;
}) {
  const [state, action, pending] = useActionState(decideDiscount, initialState);

  const percent =
    totalFeePaise > 0 ? Math.round((pendingPaise / totalFeePaise) * 1000) / 10 : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-500/50 bg-amber-500/5 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">
            {formatINR(pendingPaise)}
            {percent !== null ? ` (${percent}%)` : ""} discount waiting for approval
          </p>
          <p className="text-xs text-muted-foreground">
            {requestedBy ? `Agreed by ${requestedBy}` : "Requested"}
            {requestedAt
              ? ` on ${new Date(requestedAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  timeZone: "Asia/Kolkata",
                })}`
              : ""}
            . It is <strong>not applied</strong> — the fee below, and everything accounts collect
            against it, is the full amount until somebody approves this.
          </p>
        </div>
      </div>

      {canDecide && (
        <form action={action} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="enrolmentId" value={enrolmentId} />
          <Input
            name="note"
            placeholder="Note (optional) — why you approved or refused"
            className="h-9 min-w-56 flex-1"
          />
          <Button type="submit" name="decision" value="approve" size="sm" disabled={pending}>
            <Check className="size-4" /> Approve
          </Button>
          <Button
            type="submit"
            name="decision"
            value="reject"
            size="sm"
            variant="outline"
            disabled={pending}
          >
            <X className="size-4" /> Reject
          </Button>
        </form>
      )}

      <FormMessage error={state.error} success={state.success} />
    </div>
  );
}
