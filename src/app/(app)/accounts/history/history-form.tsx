"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { importPastAdmissions, type HistoryImportState } from "./actions";

const initial: HistoryImportState = {};

export function HistoryForm({
  centers,
  years,
}: {
  centers: Array<{ id: string; name: string }>;
  years: Array<{ value: string; label: string }>;
}) {
  const [state, action, pending] = useActionState(importPastAdmissions, initial);
  return (
    <form action={action} className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="h-center">Centre</Label>
          <select id="h-center" name="centerId" required className="h-9 rounded-md border bg-transparent px-3 text-sm">
            {centers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="h-year">Academic year</Label>
          <select id="h-year" name="academicYear" required className="h-9 rounded-md border bg-transparent px-3 text-sm">
            {years.map((y) => (
              <option key={y.value} value={y.value}>{y.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="h-rows">Students</Label>
        <textarea
          id="h-rows"
          name="rows"
          required
          rows={12}
          placeholder={"Asha Nair, 9847012345, NID\nRahul K, 98950 11111, UCEED, 14/07/2025, 85000"}
          className="rounded-md border bg-transparent p-3 font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          One student per line: <strong>name, phone, course</strong>, then optionally the <strong>date they joined</strong> (dd/mm/yyyy) and the{" "}
          <strong>total fee</strong>. Paste straight from a spreadsheet or separate with commas. Without a date they are placed at the start of the academic
          year; without a fee it stays at ₹0 for the accountant to fill in.
        </p>
      </div>
      <FormMessage error={state.error} success={state.success} />
      {state.problems && state.problems.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
          {state.problems.map((p) => (
            <li key={`${p.line}-${p.message}`}>Line {p.line}: {p.message}</li>
          ))}
        </ul>
      )}
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add these admissions"}</Button>
      </div>
    </form>
  );
}
