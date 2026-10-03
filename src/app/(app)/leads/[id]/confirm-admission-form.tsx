"use client";

import { useActionState, useMemo, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { MoneyInput } from "@/components/ui/smart-inputs";
import { Label } from "@/components/ui/label";
import { academicYearOptions } from "@/lib/enrolment/academic-year";
import type { FieldOption } from "@/lib/fields/resolve-field-options";

import { confirmAdmissionAction, type FormState } from "./actions";

const initialState: FormState = {};

/**
 * Gate 1, sales -> accounts. Irreversible via this form once submitted —
 * there is no "un-confirm" button, matching CLAUDE.md's "irreversible
 * without an admin override." A manual fee override is offered because
 * fee_structures coverage is admin-maintained and won't always have a row
 * for every course/mode/year combination from day one.
 */
export interface AdmissionBatchOption {
  id: string;
  name: string;
  course: string;
  academicYear: string;
  spacesLeft: number | null;
}

export function ConfirmAdmissionForm({
  leadId,
  courses,
  modes,
  batches,
}: {
  leadId: string;
  courses: FieldOption[];
  modes: FieldOption[];
  batches: AdmissionBatchOption[];
}) {
  const [state, formAction, pending] = useActionState(
    confirmAdmissionAction.bind(null, leadId),
    initialState,
  );
  const [course, setCourse] = useState("");

  // Only the batches for the course being confirmed. Showing all of them
  // invites picking a Crash batch for a Foundation admission, and that
  // mistake is invisible afterwards — the enrolment looks complete either
  // way. Before a course is chosen the list is empty and says so.
  const batchesForCourse = useMemo(
    () => (course ? batches.filter((batch) => batch.course === course) : []),
    [batches, course],
  );

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">Confirm admission</h3>
      <p className="text-xs text-muted-foreground">
        Creates the enrolment and hands this lead off to accounts. This can&apos;t be undone from
        here.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="admission-course">Course</Label>
          <Combobox
            id="admission-course"
            name="course"
            required
            options={courses}
            placeholder="Select course"
            searchPlaceholder="Type to search…"
            onChange={setCourse}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="admission-mode">Mode</Label>
          <Combobox
            id="admission-mode"
            name="mode"
            required
            options={modes}
            placeholder="Select mode"
            searchPlaceholder="Type to search…"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="admission-academic-year">Academic year</Label>
          <Combobox
            id="admission-academic-year"
            name="academicYear"
            options={academicYearOptions()}
            placeholder="Choose a year"
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="admission-batch">Batch</Label>
          <Combobox
            id="admission-batch"
            name="batchId"
            options={batchesForCourse.map((batch) => ({
              value: batch.id,
              label:
                batch.spacesLeft === null
                  ? `${batch.name} · ${batch.academicYear}`
                  : `${batch.name} · ${batch.academicYear} · ${batch.spacesLeft} left`,
            }))}
            placeholder={course ? "Choose a batch" : "Pick a course first"}
            searchPlaceholder="Type to search…"
          />
          <p className="text-xs text-muted-foreground">
            {course && batchesForCourse.length === 0
              ? "No batch for this course yet — an admin adds them in Settings → Batches. You can confirm without one and set it later."
              : "Carried through to the student record once accounts take the first payment."}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="admission-discount">Discount</Label>
          <MoneyInput id="admission-discount" name="discount" placeholder="0" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="admission-fee-override">Manual fee override</Label>
          <MoneyInput
            id="admission-fee-override"
            name="totalFeeOverride"
            placeholder="Blank uses the fee structure"
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
