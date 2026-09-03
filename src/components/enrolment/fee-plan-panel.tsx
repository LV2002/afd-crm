"use client";

import { Printer, Save } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveFeePlan, type FeeFormState } from "@/lib/enrolment/fee-actions";
import { INSTALMENT_SLOTS } from "@/lib/enrolment/instalment-plan";
import { formatINR } from "@/lib/format/currency";

const initialState: FeeFormState = {};

export interface FeePlanValues {
  courseFee: string;
  discount: string;
  discountName: string;
  downPayment: string;
  feeNotes: string;
  instalments: Array<{ sequence: number; dueDate: string; amount: string }>;
}

/** Parses what's typed so the running total updates as the counsellor works. */
function toPaise(value: string): number {
  const cleaned = value.replace(/[,\s₹]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return 0;
  return Math.round(Number(cleaned) * 100);
}

export function FeePlanPanel({
  leadId,
  values,
  canEdit,
  hasEnrolment,
  hasSignedAgreement,
  printHref,
}: {
  leadId: string;
  values: FeePlanValues;
  canEdit: boolean;
  hasEnrolment: boolean;
  hasSignedAgreement: boolean;
  printHref: string;
}) {
  const [state, action, pending] = useActionState(saveFeePlan, initialState);
  const [fee, setFee] = useState(values.courseFee);
  const [discount, setDiscount] = useState(values.discount);
  const [amounts, setAmounts] = useState<Record<number, string>>(
    Object.fromEntries(values.instalments.map((i) => [i.sequence, i.amount])),
  );

  const netPaise = Math.max(0, toPaise(fee) - toPaise(discount));
  const scheduledPaise = Object.values(amounts).reduce((sum, v) => sum + toPaise(v), 0);
  const shortfallPaise = netPaise - scheduledPaise;
  const planComplete = netPaise > 0 && shortfallPaise === 0;

  if (!hasEnrolment) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Confirm the admission first. The fee plan is part of the enrolment record, so it needs the
        admission confirmed before it can be entered.
      </p>
    );
  }

  const dueByslot = new Map(values.instalments.map((i) => [i.sequence, i.dueDate]));

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-4 rounded-lg border p-4">
        <input type="hidden" name="leadId" value={leadId} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="courseFee">Course fee (₹)</Label>
            <Input
              id="courseFee"
              name="courseFee"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              disabled={!canEdit}
              inputMode="decimal"
              placeholder="45000"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="discount">Discount (₹)</Label>
            <Input
              id="discount"
              name="discount"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              disabled={!canEdit}
              inputMode="decimal"
              placeholder="0"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="downPayment">Down payment (₹)</Label>
            <Input
              id="downPayment"
              name="downPayment"
              defaultValue={values.downPayment}
              disabled={!canEdit}
              inputMode="decimal"
              placeholder="0"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="discountName">Discount name</Label>
            <Input
              id="discountName"
              name="discountName"
              defaultValue={values.discountName}
              disabled={!canEdit}
              placeholder="e.g. Early Bird"
            />
          </div>
        </div>

        <div className="rounded-md bg-muted/40 p-3 text-sm">
          <span className="font-medium">Payable: {formatINR(netPaise)}</span>
          {netPaise > 0 && (
            <span className={shortfallPaise === 0 ? " text-emerald-600" : " text-muted-foreground"}>
              {" · "}
              Scheduled {formatINR(scheduledPaise)}
              {shortfallPaise > 0 && ` · ${formatINR(shortfallPaise)} not yet scheduled`}
              {shortfallPaise < 0 && ` · ${formatINR(-shortfallPaise)} over-scheduled`}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Label>Instalments</Label>
          {INSTALMENT_SLOTS.map((slot) => (
            <div key={slot} className="grid gap-3 sm:grid-cols-[3rem_1fr_1fr] sm:items-center">
              <span className="text-sm text-muted-foreground">#{slot}</span>
              <Input
                name={`instalment_${slot}_due`}
                type="date"
                defaultValue={dueByslot.get(slot) ?? ""}
                disabled={!canEdit}
                aria-label={`Instalment ${slot} due date`}
              />
              <Input
                name={`instalment_${slot}_amount`}
                value={amounts[slot] ?? ""}
                onChange={(e) => setAmounts((a) => ({ ...a, [slot]: e.target.value }))}
                disabled={!canEdit}
                inputMode="decimal"
                placeholder="Amount ₹"
                aria-label={`Instalment ${slot} amount`}
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Leave a row blank if it isn&apos;t used. Fill in both the date and the amount, or neither.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="feeNotes">Additional notes</Label>
          <Textarea id="feeNotes" name="feeNotes" defaultValue={values.feeNotes} rows={2} disabled={!canEdit} />
        </div>

        {state.error && <FormMessage error={state.error} />}
        {state.success && <FormMessage success={state.success} />}

        {canEdit && (
          <div>
            <Button type="submit" disabled={pending} size="sm">
              <Save className="size-4" />
              {pending ? "Saving…" : "Save fee plan"}
            </Button>
          </div>
        )}
      </form>

      {/*
        Printing comes BEFORE the signed copy, not after: the counsellor
        prints this, the student signs it on paper, and the signed sheet is
        scanned back in as an attachment. Gating printing on the upload
        would make the workflow impossible.

        It is still gated on the plan being complete, which is a different
        thing: a half-entered schedule would print an agreement whose
        numbers don't add up, and that is the copy the student keeps.
      */}
      {planComplete ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href={printHref} target="_blank">
              <Printer className="size-4" /> Print instalment agreement
            </Link>
          </Button>
          <span className="text-xs text-muted-foreground">
            {hasSignedAgreement
              ? "Signed copy is on file."
              : "Print it, get it signed, then upload the signed copy under Files below."}
          </span>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          The instalments need to add up to the payable amount before the agreement can be
          printed. {shortfallPaise > 0 && `${formatINR(shortfallPaise)} still to schedule.`}
        </p>
      )}
    </div>
  );
}
