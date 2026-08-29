"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
        <Select name="course" defaultValue={values.course || undefined} required>
          <SelectTrigger id="fee-structure-course">
            <SelectValue placeholder="Select course" />
          </SelectTrigger>
          <SelectContent>
            {courses.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="fee-structure-center">Centre</Label>
        <Select name="centerId" defaultValue={values.centerId || undefined} required>
          <SelectTrigger id="fee-structure-center">
            <SelectValue placeholder="Select centre" />
          </SelectTrigger>
          <SelectContent>
            {centers.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="fee-structure-mode">Mode</Label>
        <Select name="mode" defaultValue={values.mode || undefined} required>
          <SelectTrigger id="fee-structure-mode">
            <SelectValue placeholder="Select mode" />
          </SelectTrigger>
          <SelectContent>
            {modes.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
