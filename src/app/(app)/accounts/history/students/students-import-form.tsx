"use client";

import { useActionState, useState, useTransition } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { runAdmittedStudents, type AdmittedState } from "./actions";

const initial: AdmittedState = {};
const select = "h-9 w-full max-w-[16rem] rounded-md border bg-transparent px-2 text-sm";

export function StudentsImportForm({ years }: { years: Array<{ value: string; label: string }> }) {
  const [state, formAction, pending] = useActionState(runAdmittedStudents, initial);
  const [, startTransition] = useTransition();
  // Chosen course and batch per centre-and-course group. Kept here, not left
  // to the form, so checking the file and importing it are two presses of the
  // same form with nothing cleared in between.
  const [choices, setChoices] = useState<Record<string, { course?: string; batch?: string }>>({});
  const p = state.preview;
  const r = state.result;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const data = new FormData(e.currentTarget, submitter);
        startTransition(() => formAction(data));
      }}
      className="flex flex-col gap-4 rounded-lg border p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="as-file">File (.csv)</Label>
          <input id="as-file" name="file" type="file" accept=".csv,text/csv" required className="text-sm" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="as-year">Academic year (for students you give no batch)</Label>
          <select id="as-year" name="academicYear" required className="h-9 rounded-md border bg-transparent px-3 text-sm">
            {years.map((y) => (
              <option key={y.value} value={y.value}>{y.label}</option>
            ))}
          </select>
        </div>
      </div>

      {p && (
        <div className="flex flex-col gap-3 text-sm">
          <p>
            <strong>{p.total}</strong> students in the file; <strong>{p.ready}</strong> ready to import
            {p.dropped > 0 ? `, ${p.dropped} marked dropped` : ""}. Choose the course and batch each group is joining.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr><th className="py-1 pr-3">In the file</th><th className="pr-3">Students</th><th className="pr-3">Course</th><th>Batch</th></tr>
              </thead>
              <tbody>
                {p.groups.map((g) => {
                  const course = choices[g.key]?.course ?? g.matchedCourse ?? "";
                  const batches = p.batches.filter((b) => b.course === course && (!g.centerId || b.centerId === g.centerId));
                  const batch = choices[g.key]?.batch ?? "";
                  return (
                    <tr key={g.key} className="border-t align-top">
                      <td className="py-2 pr-3">{g.centre}<br /><span className="text-muted-foreground">{g.sheet}</span></td>
                      <td className="pr-3">{g.count}</td>
                      <td className="pr-3">
                        <select
                          name={`course:${g.key}`}
                          value={course}
                          onChange={(e) => setChoices((c) => ({ ...c, [g.key]: { course: e.target.value, batch: "" } }))}
                          className={`${select} ${course ? "" : "border-destructive"}`}
                          aria-label={`Course for ${g.centre} ${g.sheet}`}
                        >
                          <option value="">{g.note ?? "Choose a course…"}</option>
                          {p.courses.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <select
                          name={`batch:${g.key}`}
                          value={batch}
                          onChange={(e) => setChoices((c) => ({ ...c, [g.key]: { course, batch: e.target.value } }))}
                          className={select}
                          disabled={!course}
                          aria-label={`Batch for ${g.centre} ${g.sheet}`}
                        >
                          <option value="">No batch yet</option>
                          {batches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                        </select>
                        {course && batches.length === 0 && <p className="text-xs text-muted-foreground">No running batch for this course{g.centre ? ` at ${g.centre}` : ""}. Add one under Courses &amp; Batches.</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {p.unknownCentres.length > 0 && <p className="text-destructive">Centres not found: {p.unknownCentres.join(", ")}. Pick a batch for those rows and its centre is used.</p>}
          {p.alreadyAdmitted.length > 0 && <p className="text-muted-foreground">Already admitted in the CRM, so left alone: {p.alreadyAdmitted.join(", ")}.</p>}
          {p.problems.length > 0 && (
            <ul className="list-disc pl-5 text-destructive">
              {p.problems.map((x) => <li key={`${x.line}-${x.message}`}>Line {x.line}, {x.name}: {x.message}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" name="intent" value="preview" variant="outline" disabled={pending}>{pending ? "Working…" : "Check the file"}</Button>
        <Button type="submit" name="intent" value="import" disabled={pending || !p}>Import</Button>
      </div>
      <FormMessage error={state.error} />

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
