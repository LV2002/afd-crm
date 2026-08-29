"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { TagFormState } from "./actions";

export interface TagFormValues {
  name: string;
  color: string;
}

const initialState: TagFormState = {};

export function TagForm({
  values,
  action,
  submitLabel,
}: {
  values: TagFormValues;
  action: (prevState: TagFormState, formData: FormData) => Promise<TagFormState>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={values.name} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="color">Colour</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label="Tag colour picker"
            defaultValue={values.color || "#0ea5e9"}
            className="h-9 w-10 shrink-0 rounded border border-input"
            onChange={(e) => {
              const input = document.getElementById("color") as HTMLInputElement | null;
              if (input) input.value = e.target.value;
            }}
          />
          <Input id="color" name="color" defaultValue={values.color} placeholder="#0ea5e9" />
        </div>
      </div>
      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
