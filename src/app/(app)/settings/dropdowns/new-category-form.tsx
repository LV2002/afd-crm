"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { createCategory, type CategoryFormState } from "./actions";

const initialState: CategoryFormState = {};

export function NewCategoryForm() {
  const [state, formAction, pending] = useActionState(createCategory, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="key">Key</Label>
        <Input id="key" name="key" placeholder="preferred_shift" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="label">Label</Label>
        <Input id="label" name="label" placeholder="Preferred Shift" required />
      </div>
      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Creating..." : "Create category"}
      </Button>
    </form>
  );
}
