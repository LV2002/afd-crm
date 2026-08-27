"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { createOption, type OptionFormState } from "./actions";

const initialState: OptionFormState = {};

export function AddOptionForm({ category }: { category: string }) {
  const action = createOption.bind(null, category);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor={`${category}-new-value`}>
          Value
        </label>
        <Input id={`${category}-new-value`} name="value" placeholder="very_hot" className="w-36" required />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor={`${category}-new-label`}>
          Label
        </label>
        <Input id={`${category}-new-label`} name="label" placeholder="Very Hot" className="w-40" required />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor={`${category}-new-color`}>
          Colour
        </label>
        <Input id={`${category}-new-color`} name="color" placeholder="#dc2626" className="w-28" />
      </div>
      <Button type="submit" disabled={pending} size="sm">
        {pending ? "Adding..." : "Add option"}
      </Button>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}
