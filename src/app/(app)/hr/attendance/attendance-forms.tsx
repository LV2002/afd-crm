"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { addDevice, clearAdjustment, generateKey, importPunchFile, mapPunchCode, saveShift, setAdjustment, type AttendanceFormState } from "./actions";

const initial: AttendanceFormState = {};
const field = "h-9 rounded-md border bg-background px-3 text-sm";

export function ImportForm() {
  const [state, action, pending] = useActionState(importPunchFile, initial);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="punch-file">Export from the attendance software (CSV)</Label>
        <input id="punch-file" name="file" type="file" accept=".csv,text/csv" required className="text-sm" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Reading…" : "Import punches"}
      </Button>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}

export function MapCodeForm({ code, employees }: { code: string; employees: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState(mapPunchCode, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="code" value={code} />
      <span className="w-16 font-mono text-sm">{code}</span>
      <select name="employeeId" required className={field}>
        <option value="">This is…</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        Map
      </Button>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}

export function ShiftForm({ start, end }: { start: string; end: string }) {
  const [state, action, pending] = useActionState(saveShift, initial);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="shift-start">Shift starts</Label>
        <input id="shift-start" name="shiftStart" type="time" defaultValue={start} className={field} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="shift-end">Shift ends</Label>
        <input id="shift-end" name="shiftEnd" type="time" defaultValue={end} className={field} />
      </div>
      <Button type="submit" disabled={pending}>
        Save
      </Button>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}

export function KeyForm({ hasKey }: { hasKey: boolean }) {
  const [state, action, pending] = useActionState(generateKey, initial);
  return (
    <form action={action} className="flex flex-col gap-2">
      <Button type="submit" variant="outline" disabled={pending} className="w-fit">
        {hasKey ? "Make a new key (the old one stops working)" : "Make a key"}
      </Button>
      <FormMessage error={state.error} success={state.success} />
      {state.key && (
        <code className="block break-all rounded-md border bg-muted p-2 text-xs">{state.key}</code>
      )}
    </form>
  );
}

export function DeviceForm() {
  const [state, action, pending] = useActionState(addDevice, initial);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dev-serial">Device serial number</Label>
        <input id="dev-serial" name="serial" required className={field} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dev-name">Name (optional)</Label>
        <input id="dev-name" name="name" placeholder="Kochi front door" className={field} />
      </div>
      <Button type="submit" disabled={pending}>
        Register
      </Button>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}

const ADJUST_LABEL: Record<string, string> = {
  present: "Count as present",
  comp_off: "Comp-off (day off in lieu)",
  excused: "Excuse late / early",
  worked_off_day: "Worked on a day off",
};

/** Mark a day. The reason is required and is kept with who gave it. */
export function AdjustForm({ employeeId, date, current }: { employeeId: string; date: string; current?: string }) {
  const [state, action, pending] = useActionState(setAdjustment, initial);
  const [clearState, clearAction, clearing] = useActionState(clearAdjustment, initial);
  return (
    <div className="flex flex-col gap-1">
      <form action={action} className="flex flex-wrap items-center gap-1.5">
        <input type="hidden" name="employeeId" value={employeeId} />
        <input type="hidden" name="onDate" value={date} />
        <select name="kind" defaultValue={current ?? "present"} className="h-8 rounded-md border bg-background px-2 text-xs">
          {Object.entries(ADJUST_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input name="note" required placeholder="Why" className="h-8 w-40 rounded-md border bg-background px-2 text-xs" />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {current ? "Change" : "Mark"}
        </Button>
      </form>
      {current && (
        <form action={clearAction} className="flex items-center gap-2">
          <input type="hidden" name="employeeId" value={employeeId} />
          <input type="hidden" name="onDate" value={date} />
          <Button type="submit" size="sm" variant="ghost" disabled={clearing} className="h-6 px-1 text-xs">
            Clear the mark
          </Button>
          <FormMessage error={clearState.error} />
        </form>
      )}
      <FormMessage error={state.error} />
    </div>
  );
}
