"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KIND_LABELS, TEMPERATURE_KINDS } from "@/lib/leads/temperature-kinds";

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
        <Input
          id={`${category}-new-value`}
          name="value"
          placeholder="made from the label"
          className="w-36"
          title="Leave blank and it is made from the label: Saudi Arabia becomes saudi_arabia."
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor={`${category}-new-label`}>
          Label
        </label>
        <Input id={`${category}-new-label`} name="label" placeholder="Saudi Arabia" className="w-40" required />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor={`${category}-new-color`}>
          Colour
        </label>
        <Input id={`${category}-new-color`} name="color" placeholder="#dc2626" className="w-28" />
      </div>
      {category === "temperature" && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor={`${category}-new-kind`}>
            What it means
          </label>
          <select
            id={`${category}-new-kind`}
            name="kind"
            defaultValue="open"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {/* "Took admission" is deliberately absent: the only way onto it is
                confirming an admission, and the existing one already is that. */}
            {TEMPERATURE_KINDS.filter((kind) => kind !== "won").map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>
      )}
      <Button type="submit" disabled={pending} size="sm">
        {pending ? "Adding..." : "Add option"}
      </Button>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}
