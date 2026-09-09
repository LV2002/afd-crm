"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
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

      <div className="flex flex-col gap-2">
        <Label htmlFor="fee-structure-academic-year">Academic year</Label>
        <Input
          id="fee-structure-academic-year"
          name="academicYear"
          defaultValue={values.academicYear}
          placeholder="2026-27"
          required
        />
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
