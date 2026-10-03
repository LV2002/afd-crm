"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { academicYearOptions } from "@/lib/enrolment/academic-year";
import type { FieldOption } from "@/lib/fields/resolve-field-options";

import type { FeeStructureFormState } from "./actions";

export interface FeeStructureFormValues {
  course: string;
  centerId: string;
  mode: string;
  academicYear: string;
  baseFee: string;
}

const initialState: FeeStructureFormState = {};

export function FeeStructureForm({
  values,
  action,
  submitLabel,
  courses,
  modes,
  centers,
}: {
  values: FeeStructureFormValues;
  action: (prevState: FeeStructureFormState, formData: FormData) => Promise<FeeStructureFormState>;
  submitLabel: string;
  courses: FieldOption[];
  modes: FieldOption[];
  centers: FieldOption[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="fee-structure-course">Course</Label>
        <Combobox
          id="fee-structure-course"
          name="course"
          defaultValue={values.course}
          required
          options={courses}
          placeholder="Select course"
          searchPlaceholder="Type to search…"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="fee-structure-center">Centre</Label>
        <Combobox
          id="fee-structure-center"
          name="centerId"
          defaultValue={values.centerId}
          required
          options={centers}
          placeholder="Select centre"
          searchPlaceholder="Type to search…"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="fee-structure-mode">Mode</Label>
        <Combobox
          id="fee-structure-mode"
          name="mode"
          defaultValue={values.mode}
          required
          options={modes}
          placeholder="Select mode"
          searchPlaceholder="Type to search…"
        />
      </div>

      {/*
        A list, not a text box.
        `fee_structures` is found by an EXACT match on course, centre, mode
        and academic year, and the admission form has always offered a
        fixed list. This was free text with `2026-27` as a placeholder, so
        a perfectly reasonable `2027` typed here produced a fee structure
        that no admission could ever match — while sitting visibly in the
        table. Two ways to write one value, joined on equality.
      */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="fee-structure-academic-year">Academic year</Label>
        <Combobox
          id="fee-structure-academic-year"
          name="academicYear"
          defaultValue={values.academicYear}
          options={academicYearOptions(values.academicYear)}
          placeholder="Select academic year"
          required
        />
        <p className="text-xs text-muted-foreground">
          Must match the year a counsellor picks when confirming an admission, which is why
          it is chosen rather than typed.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="fee-structure-base-fee">Base fee (₹)</Label>
        <Input
          id="fee-structure-base-fee"
          name="baseFee"
          type="number"
          min="1"
          step="1"
          defaultValue={values.baseFee}
          required
        />
      </div>

      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
