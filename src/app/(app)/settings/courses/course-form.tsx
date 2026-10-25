"use client";

import { Pencil, Plus } from "lucide-react";
import { useActionState, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { saveCourse, type CourseFormState } from "./actions";

const initialState: CourseFormState = {};

/**
 * Add a course, or rename one / change its mode. Collapsed to a button until
 * wanted — the page is mostly for reading the hierarchy, and an always-open
 * form on every course would bury it.
 */
export function CourseForm({
  courseValue,
  name = "",
  mode = "",
  modes,
}: {
  courseValue?: string;
  name?: string;
  mode?: string;
  modes: Array<{ value: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(saveCourse, initialState);

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant={courseValue ? "ghost" : "default"}
        onClick={() => setOpen(true)}
      >
        {courseValue ? <Pencil className="size-4" /> : <Plus className="size-4" />}
        {courseValue ? "Edit" : "New course"}
      </Button>
    );
  }

  return (
    <form action={action} className="flex w-full flex-col gap-3 rounded-lg border bg-muted/30 p-3">
      {courseValue && <input type="hidden" name="courseValue" value={courseValue} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`course-name-${courseValue ?? "new"}`}>Course name</Label>
          <Input
            id={`course-name-${courseValue ?? "new"}`}
            name="name"
            required
            defaultValue={name}
            placeholder="NIFT Foundation"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`course-mode-${courseValue ?? "new"}`}>Mode</Label>
          <Combobox
            id={`course-mode-${courseValue ?? "new"}`}
            name="mode"
            required
            defaultValue={mode}
            options={modes}
            placeholder="Online or hybrid"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : courseValue ? "Save course" : "Add course"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}
