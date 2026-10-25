"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { academicYearOptions } from "@/lib/enrolment/academic-year";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/smart-inputs";

import { saveBatch, type BatchFormState } from "./actions";

const initialState: BatchFormState = {};

export interface BatchFormValues {
  id?: string;
  name: string;
  centerId: string;
  course: string;
  fee: string;
  academicYear: string;
  startDate: string;
  endDate: string;
  capacity: string;
  isActive: boolean;
}

/**
 * Courses come from `dropdown_options`, not from a list in this file —
 * CLAUDE.md is explicit that the course list is admin-editable and must
 * never be hardcoded. The centre list is the same. There is no mode field:
 * a batch is online or hybrid because its course is, and saveBatch reads it
 * from the course.
 */
export function BatchForm({
  values,
  centers,
  courses,
}: {
  values: BatchFormValues;
  centers: Array<{ id: string; name: string }>;
  courses: Array<{ value: string; label: string; mode: string }>;
}) {
  const [state, action, pending] = useActionState(saveBatch, initialState);

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4 rounded-lg border p-4">
      {values.id && <input type="hidden" name="batchId" value={values.id} />}

      <div className="flex flex-col gap-2">
        <Label htmlFor="batch-name">Batch name</Label>
        <Input
          id="batch-name"
          name="name"
          required
          defaultValue={values.name}
          placeholder="NIFT Foundation — Morning"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="batch-center">Centre</Label>
          <Combobox
            id="batch-center"
            name="centerId"
            defaultValue={values.centerId}
            options={centers.map((centre) => ({ value: centre.id, label: centre.name }))}
            placeholder="Choose a centre"
            searchPlaceholder="Type a centre…"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="batch-year">Academic year</Label>
          <Combobox
            id="batch-year"
            name="academicYear"
            required
            defaultValue={values.academicYear}
            options={academicYearOptions(values.academicYear || null)}
            placeholder="Choose a year"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="batch-course">Course</Label>
          <Combobox
            id="batch-course"
            name="course"
            defaultValue={values.course}
            options={courses.map((course) => ({ value: course.value, label: course.label }))}
            placeholder="Choose a course"
            searchPlaceholder="Type a course…"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="batch-fee">Fee for this batch</Label>
          <MoneyInput id="batch-fee" name="fee" defaultValue={values.fee} placeholder="Not set" />
          <p className="text-xs text-muted-foreground">
            What a family pays to join. Offers and discounts come off this at admission.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="batch-start">Starts</Label>
          <Input id="batch-start" name="startDate" type="date" defaultValue={values.startDate} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="batch-end">Ends</Label>
          <Input id="batch-end" name="endDate" type="date" defaultValue={values.endDate} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="batch-capacity">Seats</Label>
          <Input
            id="batch-capacity"
            name="capacity"
            type="number"
            min="1"
            step="1"
            defaultValue={values.capacity}
            placeholder="No limit"
          />
          <p className="text-xs text-muted-foreground">
            Leave blank for no limit. Going over is warned about, not blocked — rooms take one more
            chair.
          </p>
        </div>

        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            name="isActive"
            className="size-4"
            defaultChecked={values.isActive}
          />
          Currently running
        </label>
      </div>

      <div>
        <Button type="submit" disabled={pending}>
          <Save className="size-4" />{" "}
          {pending ? "Saving…" : values.id ? "Save changes" : "Create batch"}
        </Button>
      </div>

      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}
