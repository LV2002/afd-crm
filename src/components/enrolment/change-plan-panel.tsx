"use client";

import { Save } from "lucide-react";
import { useActionState, useMemo, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { academicYearOptions } from "@/lib/enrolment/academic-year";
import { changeEnrolmentPlan, type PlanFormState } from "@/lib/enrolment/plan-actions";
import type { FieldOption } from "@/lib/fields/resolve-field-options";

import type { AdmissionBatchOption } from "@/app/(app)/leads/[id]/confirm-admission-form";

const initialState: PlanFormState = {};

/**
 * What a confirmed student is actually studying, and in which room.
 *
 * Shown in three places on purpose — the lead (where the counsellor
 * works), the admission (where accounts work) and the student (where
 * academics work) — because all three of them change this, and a single
 * screen would mean two of the three asking somebody else to do it.
 * They all submit the same action, so whoever makes the change, the
 * enrolment, the student record, the batch roster and the notification
 * come out identical.
 *
 * Fees are deliberately absent. Moving somebody from Foundation to DWO
 * does not silently re-price their admission — see
 * `changeEnrolmentPlan` for why that would be a discount nobody
 * approved — so accounts get told the course moved and change the figure
 * themselves if it should change.
 */
export function ChangePlanPanel({
  enrolmentId,
  current,
  courses,
  modes,
  batches,
  canEdit,
  canChangeCourse,
}: {
  enrolmentId: string;
  current: { course: string; batchId: string | null; mode: string; academicYear: string };
  courses: FieldOption[];
  modes: FieldOption[];
  /** Batches at this student's own centre. */
  batches: AdmissionBatchOption[];
  canEdit: boolean;
  /**
   * The course is academics' to move, and the batch is not.
   *
   * Accounts keep this panel — correcting a batch, a mode or an academic
   * year is ordinary work for them — and lose one field in it. Shown
   * read-only rather than hidden, because "why can I not see the course
   * on this screen" is a worse question than "why can I not change it",
   * and the answer to the second is written underneath.
   */
  canChangeCourse: boolean;
}) {
  const [state, action, pending] = useActionState(changeEnrolmentPlan, initialState);
  const [course, setCourse] = useState(current.course);
  const [batchId, setBatchId] = useState(current.batchId ?? "");

  /**
   * Only the batches that run the chosen course, the same filter the
   * confirmation form uses. A Crash batch offered for a Foundation
   * student is a mistake nothing downstream can see.
   *
   * The batch they are in now is always kept in the list even if it does
   * not match — otherwise changing the course would silently drop them
   * out of their current batch in the dropdown, and the form would look
   * like it had already moved them somewhere they are not.
   */
  const options = useMemo(() => {
    const matching = batches.filter((batch) => batch.course === course);
    const currentOne = batches.find((batch) => batch.id === current.batchId);
    if (currentOne && !matching.some((batch) => batch.id === currentOne.id)) {
      return [currentOne, ...matching];
    }
    return matching;
  }, [batches, course, current.batchId]);

  if (!canEdit) return null;

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border p-4">
      <input type="hidden" name="enrolmentId" value={enrolmentId} />
      <h3 className="text-sm font-semibold">Course &amp; batch</h3>
      <p className="text-xs text-muted-foreground">
        What this student is enrolled on. Changing it does not change the fee — accounts are told
        so they can adjust it if it should.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="plan-course">Course</Label>
          {canChangeCourse ? (
            <Combobox
              id="plan-course"
              name="course"
              required
              value={course}
              onChange={setCourse}
              options={courses}
              placeholder="Select course"
              searchPlaceholder="Type to search…"
            />
          ) : (
            <>
              {/*
                The value still posts, so a save that changes only the
                batch sends the course it already had and the server sees
                no change at all — rather than an empty field it would
                reject, or a missing one it would read as "clear it".
              */}
              <input type="hidden" name="course" value={course} />
              <p className="flex min-h-9 items-center rounded-md border bg-muted/40 px-3 text-sm">
                {courses.find((option) => option.value === course)?.label ?? course}
              </p>
              <p className="text-xs text-muted-foreground">
                Academics change the course. They are told nothing automatically — ask them, and
                accounts are notified the moment they do it.
              </p>
            </>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="plan-mode">Mode</Label>
          <Combobox
            id="plan-mode"
            name="mode"
            required
            defaultValue={current.mode}
            options={modes}
            placeholder="Select mode"
            searchPlaceholder="Type to search…"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="plan-academic-year">Academic year</Label>
          <Combobox
            id="plan-academic-year"
            name="academicYear"
            required
            defaultValue={current.academicYear}
            options={academicYearOptions()}
            placeholder="Select year"
            searchPlaceholder="Type to search…"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="plan-batch">Batch</Label>
          {/*
            Clearable rather than offering a "No batch" item: an empty
            value posts as an empty string, which the action already reads
            as "not in a batch", and a sentinel token would be a third
            spelling of null for somebody to get wrong later.
          */}
          <Combobox
            id="plan-batch"
            name="batchId"
            clearable
            value={batchId}
            onChange={setBatchId}
            options={options.map((batch) => ({
              value: batch.id,
              label:
                batch.spacesLeft === null ? batch.name : `${batch.name} — ${batch.spacesLeft} left`,
            }))}
            placeholder="No batch"
            searchPlaceholder="Type to search…"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="plan-reason">Reason (optional)</Label>
        <Input
          id="plan-reason"
          name="reason"
          placeholder="Moved to the evening batch at the family's request"
        />
        <p className="text-xs text-muted-foreground">
          Kept on the batch history, so next year somebody can see why they moved.
        </p>
      </div>

      <FormMessage error={state.error} success={state.success} />

      {/*
        Asked before, not after. Three departments are told about this,
        the batch roster gains a line that stays on the record, and a
        mis-click here reads to academics as a student who changed course.
      */}
      <ConfirmSubmit
        label="Save course & batch"
        icon={<Save className="size-4" />}
        pending={pending}
        pendingLabel="Saving…"
        title="Change what this student is enrolled on?"
        body={
          <>
            This updates the admission record, the student&apos;s own page and the batch roster,
            and tells accounts and academics.
            <br />
            <br />
            The fee is not changed.
          </>
        }
        confirmLabel="Yes, change it"
      />
    </form>
  );
}
