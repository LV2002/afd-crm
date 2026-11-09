"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import {
  cancelCompDayRequest,
  decideCompDayRequest,
  requestCompDay,
  resetOptionalHoliday,
  takeOptionalHoliday,
  type HrFormState,
} from "./actions";

const initial: HrFormState = {};
const field = "h-9 rounded-md border bg-background px-3 text-sm";

/** Work a day off, take another day off instead. */
export function CompDayForm() {
  const [state, action, pending] = useActionState(requestCompDay, initial);
  const [workPart, setWorkPart] = useState("full");
  return (
    <form action={action} className="flex max-w-xl flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Working on your day off or a holiday? Pick that day, and the working day you want off instead.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="comp-work-date">I will work on</Label>
          <input id="comp-work-date" name="workDate" type="date" required className={field} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="comp-work-part">For</Label>
          <select id="comp-work-part" name="workPart" value={workPart} onChange={(e) => setWorkPart(e.target.value)} className={field}>
            <option value="full">A full day</option>
            <option value="half">A half day</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="comp-off-date">I will take off</Label>
          <input id="comp-off-date" name="offDate" type="date" required className={field} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="comp-off-part">For</Label>
          <select id="comp-off-part" name="offPart" defaultValue="full" key={workPart} className={field}>
            {workPart === "full" && <option value="full">A full day</option>}
            <option value="half">A half day</option>
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="comp-reason">Reason (optional)</Label>
        <input id="comp-reason" name="reason" className={field} />
      </div>
      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Sending…" : "Send for approval"}
      </Button>
    </form>
  );
}

export function CompDecideButtons({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(decideCompDayRequest, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="requestId" value={requestId} />
      <input name="note" placeholder="Note (needed to turn it down)" className="h-8 w-52 rounded-md border bg-background px-2 text-xs" />
      <Button type="submit" name="decision" value="approved" size="sm" disabled={pending}>Approve</Button>
      <Button type="submit" name="decision" value="rejected" size="sm" variant="outline" disabled={pending}>Turn down</Button>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}

export function CompCancelButton({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(cancelCompDayRequest, initial);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>Withdraw</Button>
      <FormMessage error={state.error} />
    </form>
  );
}

/** One optional holiday, with the button to take it. */
export function TakeOptionalButton({ holidayId, name }: { holidayId: string; name: string }) {
  const [state, action, pending] = useActionState(takeOptionalHoliday, initial);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="holidayId" value={holidayId} />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={(e) => {
          // One choice a year, and it cannot be taken back: ask first.
          if (!window.confirm(`Take ${name} as your optional holiday? You can't pick another this year.`)) e.preventDefault();
        }}
      >
        Take this
      </Button>
      <FormMessage error={state.error} />
    </form>
  );
}

export function ResetOptionalButton({ employeeId, year }: { employeeId: string; year: number }) {
  const [state, action, pending] = useActionState(resetOptionalHoliday, initial);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="year" value={year} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>Reset choice</Button>
      <FormMessage error={state.error} />
    </form>
  );
}
