"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  addHoliday,
  applyLeave,
  cancelLeaveRequest,
  decideLeaveRequest,
  removeHoliday,
  saveEmployee,
  saveWorkingWeek,
  savePolicy,
  type HrFormState,
} from "./actions";

const initial: HrFormState = {};
const field = "h-9 rounded-md border bg-background px-3 text-sm";

export function ApplyLeaveForm() {
  const [state, action, pending] = useActionState(applyLeave, initial);
  const [kind, setKind] = useState("casual");
  return (
    <form action={action} className="flex max-w-xl flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="leave-kind">Kind</Label>
          <select id="leave-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
            <option value="casual">Casual leave</option>
            <option value="sick">Sick leave</option>
            <option value="half_day">Half day</option>
            <option value="lop">Loss of pay</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="leave-from">{kind === "half_day" ? "Date" : "From"}</Label>
          <input id="leave-from" name="fromDate" type="date" required className={field} />
        </div>
        {kind !== "half_day" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="leave-to">To</Label>
            <input id="leave-to" name="toDate" type="date" required className={field} />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="leave-reason">Reason (optional)</Label>
        <input id="leave-reason" name="reason" className={field} />
      </div>
      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Sending…" : "Send for approval"}
      </Button>
    </form>
  );
}

export function DecideButtons({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(decideLeaveRequest, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="requestId" value={requestId} />
      <input name="note" placeholder="Note (needed to turn it down)" className="h-8 w-52 rounded-md border bg-background px-2 text-xs" />
      <Button type="submit" name="decision" value="approved" size="sm" disabled={pending}>
        Approve
      </Button>
      <Button type="submit" name="decision" value="rejected" size="sm" variant="outline" disabled={pending}>
        Turn down
      </Button>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}

export function CancelButton({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(cancelLeaveRequest, initial);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        Withdraw
      </Button>
      <FormMessage error={state.error} />
    </form>
  );
}

export interface EmployeeFormValues {
  id?: string;
  empNo: string;
  name: string;
  userId: string;
  designation: string;
  department: string;
  centerId: string;
  address: string;
  dateOfJoining: string;
  reportsToId: string;
  biometricCode: string;
  openingSl: string;
  openingCl: string;
  openingAsOf: string;
  status: "active" | "inactive";
}

export function EmployeeForm({
  values,
  logins,
  centers,
  managers,
}: {
  values: EmployeeFormValues;
  logins: Array<{ id: string; name: string }>;
  centers: Array<{ id: string; name: string }>;
  managers: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(saveEmployee, initial);
  return (
    <form action={action} className="flex max-w-3xl flex-col gap-4 rounded-lg border p-4">
      {values.id && <input type="hidden" name="employeeId" value={values.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Text name="name" label="Name" defaultValue={values.name} required />
        <Text name="empNo" label="Employee number" defaultValue={values.empNo} required hint="Text is fine: 10085, AFD/10050" />
        <Text name="designation" label="Designation" defaultValue={values.designation} />
        <Text name="department" label="Department" defaultValue={values.department} />
        <Pick name="centerId" label="Location" defaultValue={values.centerId} options={centers} blank="—" />
        <Text name="dateOfJoining" label="Date of joining" type="date" defaultValue={values.dateOfJoining} hint="Blank means long-standing" />
        <Pick name="reportsToId" label="Reports to (approves their leave)" defaultValue={values.reportsToId} options={managers} blank="Nobody: HR approves" />
        <Text name="biometricCode" label="Biometric code" defaultValue={values.biometricCode} hint="The code this person has on the attendance device" />
        <Pick name="userId" label="CRM login" defaultValue={values.userId} options={logins} blank="None yet" hint="Needed for them to see their page and apply for leave" />
      </div>
      <Text name="address" label="Address" defaultValue={values.address} />

      <fieldset className="grid gap-3 rounded-md border p-3 sm:grid-cols-3">
        <legend className="px-1 text-xs font-medium">Leave balances brought forward (optional)</legend>
        <Text name="openingSl" label="Sick left" defaultValue={values.openingSl} inputMode="decimal" />
        <Text name="openingCl" label="Casual left" defaultValue={values.openingCl} inputMode="decimal" />
        <Text name="openingAsOf" label="As of" type="date" defaultValue={values.openingAsOf} hint="For people whose balance is on an old payslip" />
      </fieldset>

      {values.id && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="emp-status">Status</Label>
          <select id="emp-status" name="status" defaultValue={values.status} className={field}>
            <option value="active">Active</option>
            <option value="inactive">Inactive (left, or on a long break)</option>
          </select>
        </div>
      )}
      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving…" : values.id ? "Save" : "Add employee"}
      </Button>
    </form>
  );
}

function Text({
  name,
  label,
  defaultValue,
  required,
  type = "text",
  hint,
  inputMode,
}: {
  name: string;
  label: string;
  defaultValue: string;
  required?: boolean;
  type?: string;
  hint?: string;
  inputMode?: "decimal";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`f-${name}`}>{label}</Label>
      <input id={`f-${name}`} name={name} type={type} required={required} defaultValue={defaultValue} inputMode={inputMode} className={field} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Pick({
  name,
  label,
  defaultValue,
  options,
  blank,
  hint,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: Array<{ id: string; name: string }>;
  blank: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`f-${name}`}>{label}</Label>
      <select id={`f-${name}`} name={name} defaultValue={defaultValue} className={field}>
        <option value="">{blank}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function PolicyForm({
  policy,
}: {
  policy: { annualSick: number; annualCasual: number; probationMonths: number; probationPaidPerMonth: number; joiningMonthCounts: boolean; weeklyOff: number[] };
}) {
  const [state, action, pending] = useActionState(savePolicy, initial);
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4 rounded-lg border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Text name="annualSick" label="Sick leave a year" defaultValue={String(policy.annualSick)} inputMode="decimal" />
        <Text name="annualCasual" label="Casual leave a year" defaultValue={String(policy.annualCasual)} inputMode="decimal" />
        <Text name="probationMonths" label="Probation (months)" defaultValue={String(policy.probationMonths)} inputMode="decimal" />
        <Text name="probationPaidPerMonth" label="Paid leaves a month in probation" defaultValue={String(policy.probationPaidPerMonth)} inputMode="decimal" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="joiningMonthCounts" defaultChecked={policy.joiningMonthCounts} />
        The month somebody joins counts towards their first year&apos;s leave
      </label>
      <fieldset className="flex flex-wrap gap-3">
        <legend className="mb-1 text-sm font-medium">Weekly off</legend>
        {WEEKDAYS.map((d, i) => (
          <label key={d} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="weeklyOff" value={i} defaultChecked={policy.weeklyOff.includes(i)} />
            {d}
          </label>
        ))}
      </fieldset>
      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving…" : "Save policy"}
      </Button>
    </form>
  );
}

export function HolidayForm({ centers }: { centers: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState(addHoliday, initial);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="h-date">Date</Label>
        <input id="h-date" name="onDate" type="date" required className={field} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="h-name">What</Label>
        <input id="h-name" name="name" required placeholder="Onam" className={field} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="h-centre">Applies to</Label>
        <select id="h-centre" name="centerId" className={field}>
          <option value="">Every centre</option>
          {centers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" name="isOptional" className="size-4" />
        Optional (each person takes one)
      </label>
      <Button type="submit" disabled={pending}>
        Add
      </Button>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}

export function RemoveHolidayButton({ holidayId }: { holidayId: string }) {
  const [state, action, pending] = useActionState(removeHoliday, initial);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="holidayId" value={holidayId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        Remove
      </Button>
      <FormMessage error={state.error} />
    </form>
  );
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** A person's working week. Late coming and early exit are measured against these times; leave skips the days off. */
export function WorkingWeekForm({
  employeeId,
  week,
  custom,
}: {
  employeeId: string;
  week: Array<{ working: boolean; start: string; end: string }>;
  custom: boolean;
}) {
  const [state, action, pending] = useActionState(saveWorkingWeek, initial);
  return (
    <form action={action} className="flex max-w-xl flex-col gap-3 rounded-lg border p-4">
      <input type="hidden" name="employeeId" value={employeeId} />
      <p className="text-xs text-muted-foreground">
        {custom ? "This person has their own week." : "Following the company default. Save to give them their own."} Late coming and early exit
        are measured against these times, and leave isn&apos;t charged on their days off.
      </p>
      <div className="grid grid-cols-[7rem_auto_1fr] items-center gap-x-3 gap-y-2 text-sm">
        {week.map((d, i) => (
          <div key={i} className="contents">
            <label className="flex items-center gap-2">
              <input type="checkbox" name={`work${i}`} defaultChecked={d.working} />
              {DAY_NAMES[i]}
            </label>
            <input type="time" name={`start${i}`} defaultValue={d.start} className={field} aria-label={`${DAY_NAMES[i]} starts`} />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">to</span>
              <input type="time" name={`end${i}`} defaultValue={d.end} className={field} aria-label={`${DAY_NAMES[i]} ends`} />
            </div>
          </div>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="useDefault" />
        Go back to the company default instead
      </label>
      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        Save working week
      </Button>
    </form>
  );
}
