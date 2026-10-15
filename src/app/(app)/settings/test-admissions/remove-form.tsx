"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { removeSelectedAdmissions, type RemoveState } from "./actions";

export interface DroppedRow {
  enrolmentId: string;
  name: string;
  leadNumber: number | null;
  course: string;
  droppedOn: string;
  dropReason: string | null;
  paymentCount: number;
  netPayment: string;
}

const initial: RemoveState = {};

export function RemoveForm({ rows }: { rows: DroppedRow[] }) {
  const [state, action, pending] = useActionState(removeSelectedAdmissions, initial);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const allPicked = rows.length > 0 && picked.size === rows.length;
  const toggle = (id: string) =>
    setPicked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">There are no dropped admissions to remove.</p>
        {state.success && <FormMessage success={state.success} />}
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={allPicked}
          onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((row) => row.enrolmentId)))}
        />
        Select all ({rows.length})
      </label>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-10 p-2" />
              <th className="p-2">Student</th>
              <th className="p-2">Course</th>
              <th className="p-2">Dropped</th>
              <th className="p-2">Payments left on the ledger</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.enrolmentId}>
                <td className="p-2">
                  <input
                    type="checkbox"
                    name="enrolmentId"
                    value={row.enrolmentId}
                    checked={picked.has(row.enrolmentId)}
                    onChange={() => toggle(row.enrolmentId)}
                    aria-label={`Select ${row.name}`}
                  />
                </td>
                <td className="p-2">
                  <span className="font-medium">{row.name}</span>
                  {row.leadNumber !== null && (
                    <span className="text-muted-foreground"> · Lead #{row.leadNumber}</span>
                  )}
                </td>
                <td className="p-2">{row.course}</td>
                <td className="p-2">
                  {row.droppedOn}
                  {row.dropReason && (
                    <span className="block text-xs text-muted-foreground">{row.dropReason}</span>
                  )}
                </td>
                <td className="p-2">
                  {row.paymentCount === 0 ? "None" : `${row.paymentCount} · net ${row.netPayment}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="alsoDeleteLeads" defaultChecked className="mt-1" />
        <span>
          Also delete the leads. They show as <strong>Took admission</strong> in the reports, so a test
          lead left behind still counts as a conversion.
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="reason">Why are these being removed?</Label>
          <Input id="reason" name="reason" placeholder="Test admissions from the workflow trial" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm">Type “remove” to confirm</Label>
          <Input id="confirm" name="confirm" autoComplete="off" required />
        </div>
      </div>

      <FormMessage error={state.error} success={state.success} />

      <Button type="submit" variant="destructive" disabled={pending || picked.size === 0} className="w-fit">
        {pending ? "Removing…" : `Remove ${picked.size || ""} selected`.replace("  ", " ")}
      </Button>
    </form>
  );
}
