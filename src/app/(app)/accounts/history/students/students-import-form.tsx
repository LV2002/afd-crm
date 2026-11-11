"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { runAdmittedStudents, type AdmittedState } from "./actions";

const initial: AdmittedState = {};

export function StudentsImportForm({ years }: { years: Array<{ value: string; label: string }> }) {
  const [state, action, pending] = useActionState(runAdmittedStudents, initial);
  const p = state.preview;
  const r = state.result;
  return (
    <form action={action} className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="as-file">File (.csv)</Label>
          <input id="as-file" name="file" type="file" accept=".csv,text/csv" required className="text-sm" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="as-year">Academic year</Label>
          <select id="as-year" name="academicYear" required className="h-9 rounded-md border bg-transparent px-3 text-sm">
            {years.map((y) => (
              <option key={y.value} value={y.value}>{y.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" name="intent" value="preview" variant="outline" disabled={pending}>{pending ? "Working…" : "Check the file"}</Button>
        <Button type="submit" name="intent" value="import" disabled={pending}>Import</Button>
      </div>
      <FormMessage error={state.error} />

      {p && (
        <div className="flex flex-col gap-3 text-sm">
          <p>
            <strong>{p.total}</strong> students in the file; <strong>{p.ready}</strong> ready to import
            {p.dropped > 0 ? `, ${p.dropped} marked dropped` : ""}.
          </p>
          <table className="w-full max-w-xl text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="py-1">Course in the file</th><th>Students</th><th>Course in the CRM</th></tr>
            </thead>
            <tbody>
              {p.byCourse.map((c) => (
                <tr key={c.sheet} className="border-t">
                  <td className="py-1">{c.sheet}</td>
                  <td>{c.count}</td>
                  <td className={c.matched ? "" : "font-medium text-destructive"}>{c.matched ?? c.note ?? "Not in the CRM yet — create it first"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {p.unknownCentres.length > 0 && <p className="text-destructive">Centres not found: {p.unknownCentres.join(", ")}.</p>}
          {p.alreadyAdmitted.length > 0 && <p className="text-muted-foreground">Already admitted in the CRM, so left alone: {p.alreadyAdmitted.join(", ")}.</p>}
          {p.problems.length > 0 && (
            <ul className="list-disc pl-5 text-destructive">
              {p.problems.map((x) => <li key={`${x.line}-${x.message}`}>Line {x.line}, {x.name}: {x.message}</li>)}
            </ul>
          )}
        </div>
      )}

      {r && (
        <div className="flex flex-col gap-2 text-sm">
          <p>
            <strong>{r.added}</strong> students added{r.attached > 0 ? ` (${r.attached} matched someone already in the CRM by phone number)` : ""}
            {r.dropped > 0 ? `, ${r.dropped} of them marked dropped` : ""}.
            {r.skipped.length > 0 ? ` ${r.skipped.length} not added:` : ""}
          </p>
          {r.skipped.length > 0 && (
            <ul className="list-disc pl-5 text-destructive">
              {r.skipped.map((x) => <li key={`${x.line}-${x.message}`}>Line {x.line}, {x.name}: {x.message}</li>)}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
