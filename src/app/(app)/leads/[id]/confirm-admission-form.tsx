"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { MoneyInput } from "@/components/ui/smart-inputs";
import { Label } from "@/components/ui/label";
import type { FieldOption } from "@/lib/fields/resolve-field-options";

import { confirmAdmissionAction, type FormState } from "./actions";

/**
 * Academic years as a list rather than a text box.
 *
 * "2026-27", "2026-2027", "26-27" and "2026/27" are four spellings of one
 * year, and typed freely all four appear — after which every fee
 * structure lookup and every cohort report splits along a formatting
 * difference nobody can see.
 */
function academicYearOptions() {
  const now = new Date();
  // An academic year is named for the calendar year it starts in, and
  // enrolment for the next one begins well before June.
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const years = [];
  for (let year = startYear - 1; year <= startYear + 2; year += 1) {
    const label = `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
    years.push({ value: label, label });
  }
  return years;
}

const initialState: FormState = {};

/**
 * Gate 1, sales -> accounts. Irreversible via this form once submitted —
 * there is no "un-confirm" button, matching CLAUDE.md's "irreversible
 * without an admin override." A manual fee override is offered because
 * fee_structures coverage is admin-maintained and won't always have a row
 * for every course/mode/year combination from day one.
 */
export function ConfirmAdmissionForm({
  leadId,
  courses,
  modes,
}: {
  leadId: string;
  courses: FieldOption[];
  modes: FieldOption[];
}) {
  const [state, formAction, pending] = useActionState(
    confirmAdmissionAction.bind(null, leadId),
    initialState,
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
