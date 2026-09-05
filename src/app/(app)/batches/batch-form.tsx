"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { saveBatch, type BatchFormState } from "./actions";

const initialState: BatchFormState = {};

export interface BatchFormValues {
  id?: string;
  name: string;
  centerId: string;
  course: string;
  mode: string;
  academicYear: string;
  startDate: string;
  endDate: string;
  capacity: string;
  isActive: boolean;
}

/**
 * Course and mode come from `dropdown_options`, not from a list in this
 * file — CLAUDE.md is explicit that the course list is admin-editable and
 * must never be hardcoded. The centre list is the same.
 */
export function BatchForm({
  values,
  centers,
  courses,
  modes,
}: {
  values: BatchFormValues;
  centers: Array<{ id: string; name: string }>;
  courses: string[];
  modes: string[];
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
          <Select name="centerId" defaultValue={values.centerId}>
            <SelectTrigger id="batch-center">
              <SelectValue placeholder="Choose a centre" />
            </SelectTrigger>
            <SelectContent>
              {centers.map((centre) => (
                <SelectItem key={centre.id} value={centre.id}>
                  {centre.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="batch-year">Academic year</Label>
          <Input
            id="batch-year"
            name="academicYear"
            required
            defaultValue={values.academicYear}
            placeholder="2026-27"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="batch-course">Course</Label>
          <Select name="course" defaultValue={values.course}>
            <SelectTrigger id="batch-course">
              <SelectValue placeholder="Choose a course" />
            </SelectTrigger>
            <SelectContent>
              {courses.map((course) => (
                <SelectItem key={course} value={course}>
                  {course}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="batch-mode">Mode</Label>
          <Select name="mode" defaultValue={values.mode}>
            <SelectTrigger id="batch-mode">
              <SelectValue placeholder="Choose a mode" />
            </SelectTrigger>
            <SelectContent>
              {modes.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {mode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            Leave blank for no limit. Going over is warned about, not blocked — rooms take one
            more chair.
          </p>
        </div>

        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="isActive" className="size-4" defaultChecked={values.isActive} />
          Currently running
        </label>
      </div>

      <div>
        <Button type="submit" disabled={pending}>
          <Save className="size-4" /> {pending ? "Saving…" : values.id ? "Save changes" : "Create batch"}
        </Button>
      </div>

      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}
