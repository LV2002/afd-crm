"use client";

import { useActionState, useMemo, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { MoneyInput } from "@/components/ui/smart-inputs";
import { Label } from "@/components/ui/label";
import { formatINR } from "@/lib/format/currency";
import type { FieldOption } from "@/lib/fields/resolve-field-options";

import { confirmAdmissionAction, type FormState } from "./actions";

const initialState: FormState = {};

/**
 * Gate 1, sales -> accounts. Irreversible via this form once submitted —
 * there is no "un-confirm" button, matching CLAUDE.md's "irreversible
 * without an admin override." The batch sets the mode, academic year and fee;
 * a custom fee is there for a negotiated price.
 */
export interface AdmissionBatchOption {
  id: string;
  name: string;
  course: string;
  mode: string;
  academicYear: string;
  feePaise: number | null;
  spacesLeft: number | null;
}

export function ConfirmAdmissionForm({
  leadId,
  courses,
  modes,
  batches,
  hasCentre,
}: {
  leadId: string;
  courses: FieldOption[];
  modes: FieldOption[];
  batches: AdmissionBatchOption[];
  /** False when the lead has no centre yet — no batch can be offered until it does. */
  hasCentre: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    confirmAdmissionAction.bind(null, leadId),
    initialState,
  );
  const [course, setCourse] = useState("");
  const [batchId, setBatchId] = useState("");

  // Only the batches for the course being confirmed. Showing all of them
  // invites picking a Crash batch for a Foundation admission, and that
  // mistake is invisible afterwards — the enrolment looks complete either
  // way. Before a course is chosen the list is empty and says so.
  const batchesForCourse = useMemo(
    () => (course ? batches.filter((batch) => batch.course === course) : []),
    [batches, course],
  );
  const chosen = batchesForCourse.find((batch) => batch.id === batchId) ?? null;

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">Confirm admission</h3>
      <p className="text-xs text-muted-foreground">
        Creates the enrolment and hands this lead off to accounts. This can&apos;t be undone from
        here.
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="admission-course">Course</Label>
        <Combobox
          id="admission-course"
          name="course"
          required
          options={courses}
          placeholder="Select course"
          searchPlaceholder="Type to search…"
          onChange={(next) => {
            setCourse(next);
            setBatchId("");
          }}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="admission-batch">Batch</Label>
        <Combobox
          id="admission-batch"
          name="batchId"
          required
          options={batchesForCourse.map((batch) => ({
            value: batch.id,
            label:
              batch.spacesLeft === null
                ? `${batch.name} · ${batch.academicYear}`
                : `${batch.name} · ${batch.academicYear} · ${batch.spacesLeft} left`,
          }))}
          placeholder={course ? "Choose a batch" : "Pick a course first"}
          searchPlaceholder="Type to search…"
          onChange={setBatchId}
        />
        {chosen ? (
          <p className="text-xs text-muted-foreground">
            {modeLabel(modes, chosen.mode)} · {chosen.academicYear} ·{" "}
            {chosen.feePaise === null
              ? "no fee set on this batch — type a custom fee below"
              : `fee ${formatINR(chosen.feePaise)}`}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {!hasCentre
              ? "This lead has no centre yet. Set one on the lead first — batches are offered for the lead's centre."
              : course && batchesForCourse.length === 0
              ? "No batch for this course at this centre yet — an admin adds one in Settings → Courses & Batches."
              : "The batch sets the mode, academic year and fee."}
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="admission-discount">Discount</Label>
          <MoneyInput id="admission-discount" name="discount" placeholder="0" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="admission-fee-override">Custom fee (optional)</Label>
          <MoneyInput
            id="admission-fee-override"
            name="totalFeeOverride"
            placeholder="Blank uses the batch fee"
          />
        </div>
      </div>

      <FormMessage error={state.error} success={state.success} />
      {/* Gate 1 is a one-way door: sales work on this lead stops, and only
          an administrator can walk it back. Worth one deliberate press
          from a counsellor who is otherwise editing fields on the same
          screen. */}
      <ConfirmSubmit
        label="Confirm admission"
        size="lg"
        pending={pending}
        pendingLabel="Confirming…"
        title="Confirm this admission?"
        body={
          <>
            This hands the family to accounts and <strong>ends sales work on this lead</strong>.
            Only an administrator can undo it.
            <br />
            <br />
            Do this when the admission is actually agreed — not when it looks likely.
          </>
        }
        confirmLabel="Yes, confirm it"
      />
    </form>
  );
}

function modeLabel(modes: FieldOption[], value: string): string {
  return modes.find((mode) => mode.value === value)?.label ?? value;
}
