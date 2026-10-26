"use client";

import { Printer, Save } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/smart-inputs";
import { Textarea } from "@/components/ui/textarea";
import { saveFeePlan, type FeeFormState } from "@/lib/enrolment/fee-actions";
import { composeDiscountName, splitSavedDiscount } from "@/lib/enrolment/discount-parts";
import { INSTALMENT_SLOTS } from "@/lib/enrolment/instalment-plan";
import { suggestSchedule } from "@/lib/enrolment/plan-status";
import { describePromo, promoDiscountPaise, type Promo } from "@/lib/enrolment/promos";
import { formatINR } from "@/lib/format/currency";

const initialState: FeeFormState = {};

/** shadcn's Select can't hold an empty-string item, so "no offer" needs a token. */
const NO_PROMO = "__none__";

export interface FeePlanValues {
  courseFee: string;
  discount: string;
  discountName: string;
  promoId: string;
  downPayment: string;
  downPaymentDue: string;
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
  promos,
}: {
  leadId: string;
  values: FeePlanValues;
  canEdit: boolean;
  hasEnrolment: boolean;
  hasSignedAgreement: boolean;
  printHref: string;
  /** Offers already filtered to the ones running for this course and centre. */
  promos: Promo[];
}) {
  const [state, action, pending] = useActionState(saveFeePlan, initialState);
  const [fee, setFee] = useState(values.courseFee);
  const [promoId, setPromoId] = useState(values.promoId);

  const chosenPromo = promos.find((promo) => promo.id === promoId) ?? null;
  const promoPaise = chosenPromo ? promoDiscountPaise(chosenPromo, toPaise(fee)) : 0;

  /*
    One discount, in two parts.

    The offer is the part the institute has already agreed: its amount is
    worked out from the fee and shown, not typed. The extra is whatever a
    counsellor negotiates on top, with a reason. The server still receives a
    single `discount` and a single `discountName` — the total, and the two
    names joined — so what is saved, approved and reported is unchanged: an
    offer is the pre-approved floor, and anything beyond it queues for
    approval like any other negotiated discount.

    Opening a plan that was saved before this split: the extra is whatever
    the saved discount was beyond the offer's worth, and its reason is the
    saved name with the offer's name taken off the front.
  */
  const savedPromo = promos.find((promo) => promo.id === values.promoId) ?? null;
  const savedSplit = splitSavedDiscount({
    discountPaise: toPaise(values.discount),
    discountName: values.discountName,
    offer: savedPromo
      ? { name: savedPromo.name, paise: promoDiscountPaise(savedPromo, toPaise(values.courseFee)) }
      : null,
  });
  const [extra, setExtra] = useState(savedSplit.extraPaise > 0 ? String(savedSplit.extraPaise / 100) : "");
  const [extraReason, setExtraReason] = useState(savedSplit.reason);

  const extraPaise = toPaise(extra);
  const totalDiscountPaise = promoPaise + extraPaise;
  const discountNameValue = composeDiscountName(chosenPromo?.name ?? null, extraPaise, extraReason);

  const [amounts, setAmounts] = useState<Record<number, string>>(
    Object.fromEntries(values.instalments.map((i) => [i.sequence, i.amount])),
  );
  const [dues, setDues] = useState<Record<number, string>>(
    Object.fromEntries(values.instalments.map((i) => [i.sequence, i.dueDate])),
  );
  const [down, setDown] = useState(values.downPayment);
  const [downDue, setDownDue] = useState(values.downPaymentDue);
  const [planCount, setPlanCount] = useState("3");
  const [startDate, setStartDate] = useState(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()),
  );

  const netPaise = Math.max(0, toPaise(fee) - totalDiscountPaise);
  const scheduledPaise =
    toPaise(down) + Object.values(amounts).reduce((sum, v) => sum + toPaise(v), 0);
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

  // Paying in one go is entered as the down payment: the whole payable
  // amount, and no instalments.
  function payInFull() {
    setDown(netPaise > 0 ? String(netPaise / 100) : "");
    setAmounts({});
    setDues({});
  }

  function fillSchedule() {
    const lines = suggestSchedule({
      netPaise,
      downPaymentPaise: toPaise(down),
      count: Number(planCount),
      startDate,
    });
    setAmounts(Object.fromEntries(lines.map((l) => [l.sequence, String(l.amountPaise / 100)])));
    setDues(Object.fromEntries(lines.map((l) => [l.sequence, l.dueDate])));
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-4 rounded-lg border p-4">
        <input type="hidden" name="leadId" value={leadId} />

        {/* Where this stands in the hand-over, so a counsellor knows whether
            accounts has anything to follow yet. */}
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            planComplete
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
          }`}
        >
          {planComplete
            ? "Plan complete. Once it is saved, accounts is told and collects by this agreement."
            : "Set the fee, the discount and the instalments. Accounts is told when the down payment and instalments add up to the payable amount."}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="courseFee">Course fee</Label>
            {/* Every money field says the amount back in words as it is
                typed. A missing zero on a fee is the most expensive
                typing mistake anybody makes here, and ₹4,500 versus
                ₹45,000 is invisible as raw digits and obvious as text. */}
            <MoneyInput
              id="courseFee"
              name="courseFee"
              value={fee}
              onValueChange={setFee}
              disabled={!canEdit}
              placeholder="45000"
            />
          </div>
        </div>

        {/* What the server receives: the total, and the names joined. */}
        <input type="hidden" name="discount" value={totalDiscountPaise > 0 ? String(totalDiscountPaise / 100) : ""} />
        <input type="hidden" name="discountName" value={discountNameValue} />
        <input type="hidden" name="promoId" value={promoId} />

        <div className="flex flex-col gap-4 rounded-md border p-4">
          <h3 className="text-sm font-medium">Discount</h3>

          {promos.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Offer</Label>
              <Combobox
                className="w-full sm:w-96"
                value={promoId || NO_PROMO}
                onChange={(value) => setPromoId(value === NO_PROMO ? "" : value)}
                disabled={!canEdit}
                options={[
                  { value: NO_PROMO, label: "No offer" },
                  ...promos.map((promo) => ({
                    value: promo.id,
                    label: promo.name,
                    hint: describePromo(promo, formatINR),
                  })),
                ]}
                placeholder="No offer"
                searchPlaceholder="Type an offer name…"
              />
              {chosenPromo && (
                <p className="text-xs text-muted-foreground">
                  {formatINR(promoPaise)} off this fee. It needs no approval — the institute is already
                  running this offer.
                </p>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="extraDiscount">
                {promos.length > 0 ? "Extra discount (optional)" : "Discount"}
              </Label>
              <MoneyInput
                id="extraDiscount"
                value={extra}
                onValueChange={setExtra}
                disabled={!canEdit}
                placeholder="0"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="extraReason">Reason for the extra discount</Label>
              <Input
                id="extraReason"
                value={extraReason}
                onChange={(e) => setExtraReason(e.target.value)}
                disabled={!canEdit || extraPaise === 0}
                placeholder="e.g. Sibling, scholarship"
              />
            </div>
          </div>

          <p className="text-sm">
            <span className="font-medium">Total discount: {formatINR(totalDiscountPaise)}</span>
            {promoPaise > 0 && extraPaise > 0 && (
              <span className="text-muted-foreground">
                {" "}
                = {formatINR(promoPaise)} offer + {formatINR(extraPaise)} extra
              </span>
            )}
            {extraPaise > 0 && (
              <span className="block text-xs text-muted-foreground">
                The extra part needs approval if it is more than you may give on your own.
              </span>
            )}
          </p>
        </div>

        <div className="rounded-md bg-muted/40 p-3 text-sm">
          <span className="font-medium">Payable: {formatINR(netPaise)}</span>
          {netPaise > 0 && (
            <span className={shortfallPaise === 0 ? " text-emerald-600" : " text-muted-foreground"}>
              {" · "}
              Down payment + instalments {formatINR(scheduledPaise)}
              {shortfallPaise > 0 && ` · ${formatINR(shortfallPaise)} not yet scheduled`}
              {shortfallPaise < 0 && ` · ${formatINR(-shortfallPaise)} over-scheduled`}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Label>Instalments</Label>
          <p className="text-xs text-muted-foreground">
            Paying in one go? Put the whole amount on the <strong>Lump sum / down payment</strong> line
            with the date it should be paid by, and leave the instalments blank. Paying in
            instalments? Enter them below; a down payment, if there is one, goes on that top line and
            is paid on top. Leave its date blank if it is due when they join.
          </p>
          {canEdit && netPaise > 0 && (
            <div className="flex flex-wrap items-end gap-3 rounded-md border border-dashed p-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="planCount" className="text-xs text-muted-foreground">
                  Split into
                </Label>
                <select
                  id="planCount"
                  value={planCount}
                  onChange={(e) => setPlanCount(e.target.value)}
                  className="h-10 rounded-md border border-input bg-card px-3 text-sm"
                >
                  {INSTALMENT_SLOTS.map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? "1 payment" : `${n} instalments`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="planStart" className="text-xs text-muted-foreground">
                  First due
                </Label>
                <Input
                  id="planStart"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-44"
                />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={fillSchedule}>
                Fill the schedule
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={payInFull}>
                Pay in full instead
              </Button>
              <p className="basis-full text-xs text-muted-foreground">
                Splits what is left after the down payment evenly, a month apart. Adjust any row
                afterwards.
              </p>
            </div>
          )}
          {/* The lump sum, or the amount paid up front, is the first line of the
              schedule with a due date of its own — the same as an instalment. */}
          <div className="grid gap-3 rounded-md bg-muted/40 p-2 sm:grid-cols-[8rem_1fr_1fr] sm:items-center">
            <span className="text-sm font-medium">Lump sum / down payment</span>
            <Input
              name="downPaymentDue"
              type="date"
              value={downDue}
              onChange={(e) => setDownDue(e.target.value)}
              disabled={!canEdit}
              aria-label="Lump sum or down payment due date"
            />
            <MoneyInput
              id="downPayment"
              name="downPayment"
              value={down}
              onValueChange={setDown}
              disabled={!canEdit}
              placeholder="Amount ₹ (0 if none)"
            />
          </div>
          {INSTALMENT_SLOTS.map((slot) => (
            <div key={slot} className="grid gap-3 sm:grid-cols-[3rem_1fr_1fr] sm:items-center">
              <span className="text-sm text-muted-foreground">#{slot}</span>
              <Input
                name={`instalment_${slot}_due`}
                type="date"
                value={dues[slot] ?? ""}
                onChange={(e) => setDues((d) => ({ ...d, [slot]: e.target.value }))}
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
            Leave a row blank if it isn&apos;t used; fill in both the date and the amount, or neither.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="feeNotes">Additional notes</Label>
          <Textarea
            id="feeNotes"
            name="feeNotes"
            defaultValue={values.feeNotes}
            rows={2}
            disabled={!canEdit}
          />
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
          The down payment and instalments need to add up to the payable amount before the agreement can be printed.{" "}
          {shortfallPaise > 0 && `${formatINR(shortfallPaise)} still to schedule.`}
        </p>
      )}
    </div>
  );
}
