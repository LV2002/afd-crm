"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import {
  approve,
  generate,
  generateReviewed,
  linkEntry,
  payFromLine,
  payOut,
  savePay,
  savePayrollSettings,
  type PayrollFormState,
} from "./actions";

const initial: PayrollFormState = {};
const field = "h-9 rounded-md border bg-background px-3 text-sm";

function Money({ name, label, defaultValue = "" }: { name: string; label: string; defaultValue?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`m-${name}`}>{label}</Label>
      <input id={`m-${name}`} name={name} inputMode="decimal" defaultValue={defaultValue} placeholder="0" className={field} />
    </div>
  );
}

export interface EntryRow {
  date: string;
  type: string;
  minutes: string;
  notes: string;
}

const ENTRY_LABELS: Record<string, string> = {
  sick: "Sick leave",
  casual: "Casual leave",
  lop: "Loss of pay",
  half_day: "Half day",
  late: "Late coming",
  early: "Early exit",
  miss_punch: "Miss punch",
};

export function GenerateForm({
  month,
  employeeId,
  employees,
  canManage,
  locked,
  suggested,
  existing,
  broughtForward,
}: {
  month: string;
  employeeId: string;
  employees: Array<{ id: string; name: string }>;
  canManage: boolean;
  /** Approved leave that payroll takes from the leave slips and cannot be changed here. */
  locked: Array<{ date: string; type: string; notes: string }>;
  suggested: EntryRow[];
  existing: { money: Record<string, string>; promotion: { date: string; designation: string; basic: string; hra: string; other: string; medical: string } | null } | null;
  broughtForward: { sl: number; cl: number; advance: string } | null;
}) {
  const [state, action, pending] = useActionState(generate, initial);
  const [rows, setRows] = useState<EntryRow[]>(suggested);
  const [promo, setPromo] = useState(Boolean(existing?.promotion));
  const m = existing?.money ?? {};
  const p = existing?.promotion;

  return (
    <form action={action} className="flex max-w-3xl flex-col gap-5 rounded-lg border p-4">
      <input type="hidden" name="entries" value={JSON.stringify(rows)} />
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="g-month">Month</Label>
          <input id="g-month" name="month" type="month" required defaultValue={month} className={field} />
        </div>
        <div className="flex min-w-56 flex-col gap-1.5">
          <Label htmlFor="g-emp">Employee</Label>
          <select id="g-emp" name="employeeId" required defaultValue={employeeId} className={field}>
            <option value="">Choose…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Pick the month and employee and press Load to see their brought-forward balances and the leave already approved.
        <Link href={`/hr/payroll/generate?month=${month}`} className="ml-1 underline">
          Reset
        </Link>
      </p>
      {broughtForward && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">
          Brought forward: sick {broughtForward.sl}, casual {broughtForward.cl}, advance outstanding {broughtForward.advance}.
        </p>
      )}

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-medium">The month&apos;s money</legend>
        <Money name="overtime" label="Overtime ₹" defaultValue={m.overtime} />
        <Money name="arrears" label="Arrears ₹" defaultValue={m.arrears} />
        <Money name="incentives" label="Incentives ₹" defaultValue={m.incentives} />
        <Money name="bonus" label="Annual bonus ₹" defaultValue={m.bonus} />
        <Money name="insurance" label="Insurance premium ₹ (deducted)" defaultValue={m.insurance} />
        <Money name="advanceGiven" label="Advance given this month ₹" defaultValue={m.advanceGiven} />
        <Money name="advanceRepaid" label="Advance repaid (deducted) ₹" defaultValue={m.advanceRepaid} />
      </fieldset>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Attendance and leave</h3>
        {locked.length > 0 && (
          <div className="rounded-md border bg-muted/40 p-2 text-xs">
            <p className="mb-1 font-medium">Approved leave (taken from the leave slips; can&apos;t be changed here)</p>
            {locked.map((l) => (
              <p key={`${l.date}-${l.type}`}>
                {l.date} — {ENTRY_LABELS[l.type]} {l.notes && <span className="text-muted-foreground">· {l.notes}</span>}
              </p>
            ))}
          </div>
        )}
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input type="date" value={r.date} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} className={field} />
            <select value={r.type} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))} className={field}>
              {Object.entries(ENTRY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            {(r.type === "late" || r.type === "early") && (
              <input
                inputMode="numeric"
                placeholder="Minutes"
                value={r.minutes}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, minutes: e.target.value } : x)))}
                className={`${field} w-24`}
              />
            )}
            <input
              placeholder="Notes"
              value={r.notes}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)))}
              className={`${field} w-48`}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
              Remove
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setRows([...rows, { date: "", type: "late", minutes: "", notes: "" }])}>
          Add a row
        </Button>
      </section>

      {canManage && (
        <section className="flex flex-col gap-3 rounded-md border p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="promotion" checked={promo} onChange={(e) => setPromo(e.target.checked)} />
            Promotion / salary change this month
          </label>
          {promo && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rev-date">Effective date</Label>
                <input id="rev-date" name="revDate" type="date" defaultValue={p?.date} className={field} />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="rev-des">New designation (optional)</Label>
                <input id="rev-des" name="revDesignation" defaultValue={p?.designation} className={field} />
              </div>
              <Money name="revBasic" label="New basic ₹" defaultValue={p?.basic} />
              <Money name="revHra" label="New HRA ₹" defaultValue={p?.hra} />
              <Money name="revOther" label="New other ₹" defaultValue={p?.other} />
              <Money name="revMedical" label="New medical ₹" defaultValue={p?.medical} />
              <p className="text-xs text-muted-foreground sm:col-span-3">Blank means unchanged. Pay before the date uses the old amounts, from the date the new ones.</p>
            </div>
          )}
        </section>
      )}

      {canManage && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="regenerate" />
          Regenerate (replace this month&apos;s existing payslip; only the latest month)
        </label>
      )}

      <FormMessage error={state.error} success={state.success} />
      {state.href && (
        <Link href={state.href} className="text-sm font-medium underline">
          Open the payslip
        </Link>
      )}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Generating…" : "Generate payslip"}
      </Button>
    </form>
  );
}

export function ApproveButton({ payslipId }: { payslipId: string }) {
  const [state, action, pending] = useActionState(approve, initial);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="payslipId" value={payslipId} />
      <Button type="submit" size="sm" disabled={pending}>
        Approve this payslip
      </Button>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}

export function PayForm({
  payslipId,
  remaining,
  accounts,
}: {
  payslipId: string;
  remaining: string;
  accounts: Array<{ id: string; name: string; type: string }>;
}) {
  const [state, action, pending] = useActionState(payOut, initial);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <input type="hidden" name="payslipId" value={payslipId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pay-account">Paid from</Label>
        <select id="pay-account" name="accountId" required className={field}>
          <option value="">Choose…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.type === "bank" ? "bank" : "cash"})
            </option>
          ))}
        </select>
      </div>
      <Money name="amount" label="Amount ₹" defaultValue={remaining} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pay-date">Date</Label>
        <input id="pay-date" name="paidOn" type="date" required className={field} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pay-ref">Reference (UTR, optional)</Label>
        <input id="pay-ref" name="reference" className={field} />
      </div>
      <Button type="submit" disabled={pending}>
        Record payment
      </Button>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}

export function LinkEntryButton({ payslipId, transactionId, label }: { payslipId: string; transactionId: string; label: string }) {
  const [state, action, pending] = useActionState(linkEntry, initial);
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="payslipId" value={payslipId} />
      <input type="hidden" name="transactionId" value={transactionId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="h-auto justify-start py-1 text-left text-xs">
        {label}
      </Button>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}

export function PayFromLineButton({ payslipId, bankLineId, label }: { payslipId: string; bankLineId: string; label: string }) {
  const [state, action, pending] = useActionState(payFromLine, initial);
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="payslipId" value={payslipId} />
      <input type="hidden" name="bankLineId" value={bankLineId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="h-auto justify-start py-1 text-left text-xs">
        {label}
      </Button>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}

export function PayRatesForm({
  employeeId,
  values,
}: {
  employeeId: string;
  values: { basic: string; hra: string; other: string; medical: string; openingAdvance: string; pan: string; bankName: string; bankAccount: string; ifsc: string };
}) {
  const [state, action, pending] = useActionState(savePay, initial);
  const text = (name: string, label: string, v: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`pr-${name}`}>{label}</Label>
      <input id={`pr-${name}`} name={name} defaultValue={v} className={field} />
    </div>
  );
  return (
    <form action={action} className="flex max-w-3xl flex-col gap-4 rounded-lg border p-4">
      <input type="hidden" name="employeeId" value={employeeId} />
      <div className="grid gap-3 sm:grid-cols-4">
        <Money name="basic" label="Basic ₹" defaultValue={values.basic} />
        <Money name="hra" label="HRA ₹" defaultValue={values.hra} />
        <Money name="other" label="Other allowance ₹" defaultValue={values.other} />
        <Money name="medical" label="Medical ₹" defaultValue={values.medical} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {text("pan", "PAN", values.pan)}
        {text("bankName", "Bank name", values.bankName)}
        {text("bankAccount", "Bank account number", values.bankAccount)}
        {text("ifsc", "IFSC", values.ifsc)}
        <Money name="openingAdvance" label="Advance outstanding when the CRM took over ₹" defaultValue={values.openingAdvance} />
      </div>
      <p className="text-xs text-muted-foreground">
        These are the monthly amounts today. A mid-month change is made from Generate payslip (a promotion), so the old amounts are kept
        for the days before it.
      </p>
      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        Save pay
      </Button>
    </form>
  );
}

export function PayrollSettingsForm({
  s,
}: {
  s: { companyName: string; companyAddress: string; lateAllowanceMin: number; earlyAllowanceMin: number; divisor: number | null; deductionFactor: number; contactEmail: string; requireApproval: boolean };
}) {
  const [state, action, pending] = useActionState(savePayrollSettings, initial);
  const text = (name: string, label: string, v: string | number) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`ps-${name}`}>{label}</Label>
      <input id={`ps-${name}`} name={name} defaultValue={v} className={field} />
    </div>
  );
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4 rounded-lg border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {text("companyName", "Company name", s.companyName)}
        {text("contactEmail", "Payslip contact email", s.contactEmail)}
        <div className="sm:col-span-2">{text("companyAddress", "Company address", s.companyAddress)}</div>
        {text("lateAllowanceMin", "Late coming allowance (min a month)", s.lateAllowanceMin)}
        {text("earlyAllowanceMin", "Early exit allowance (min a month)", s.earlyAllowanceMin)}
        {text("divisor", "Late/early divisor (blank = days in the month)", s.divisor ?? "")}
        {text("deductionFactor", "Deduction factor", s.deductionFactor)}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="requireApproval" defaultChecked={s.requireApproval} />
        A payslip must be approved by the owner before it can be paid
      </label>
      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        Save
      </Button>
    </form>
  );
}

export function GenerateReviewedForm({ month, ready, skippable }: { month: string; ready: number; skippable: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState(generateReviewed, initial);
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-3 rounded-lg border p-4">
      <input type="hidden" name="month" value={month} />
      <p className="text-sm">
        Generate the {ready} ready payslip{ready === 1 ? "" : "s"} as shown. Anyone who needs overtime, an advance or a correction: tick them to
        leave them out, and generate them one at a time.
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {skippable.map((p) => (
          <label key={p.id} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="skip" value={p.id} />
            Leave out {p.name}
          </label>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="reviewed" />I have reviewed the list above
      </label>
      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending || ready === 0} className="w-fit">
        {pending ? "Generating…" : `Generate ${ready}`}
      </Button>
    </form>
  );
}

export function PrintButton() {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
      Print
    </Button>
  );
}
