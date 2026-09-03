"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { createRegistrationForm, type FormState } from "../actions";

const initialState: FormState = {};

/** Without these two, identity resolution has nothing to match on, so the form can't be saved. */
const MANDATORY_KEYS = ["student_name", "primary_phone"];

interface FieldRow {
  key: string;
  label: string;
  type: string;
  section: string;
  is_core: boolean;
}

export function NewRegistrationFormEditor({
  fields,
  centers,
}: {
  fields: FieldRow[];
  centers: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(createRegistrationForm, initialState);
  const [selected, setSelected] = useState<string[]>(MANDATORY_KEYS);

  function toggle(key: string) {
    if (MANDATORY_KEYS.includes(key)) return;
    setSelected((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );
  }

  const sections = [...new Set(fields.map((f) => f.section))];

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Form name</Label>
        <Input id="name" name="name" required placeholder="e.g. NID Open Day 2026" />
        <p className="text-xs text-muted-foreground">Shown as the heading on the public page.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="source">Attribute leads to</Label>
          <Input id="source" name="source" defaultValue="Registration Form" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="centerId">Centre</Label>
          <select
            id="centerId"
            name="centerId"
            defaultValue=""
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          >
            <option value="">Let the assignment rules decide</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="introText">Intro text (optional)</Label>
        <Textarea id="introText" name="introText" rows={2} placeholder="A line explaining what this is for." />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="successMessage">Thank-you message (optional)</Label>
        <Textarea id="successMessage" name="successMessage" rows={2} />
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <Label>Questions to ask</Label>
          <p className="text-xs text-muted-foreground">
            Name and phone are always included — they are how a returning student is recognised
            instead of being duplicated.
          </p>
        </div>
        {sections.map((section) => (
          <div key={section} className="flex flex-col gap-2 rounded-lg border p-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">{section}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {fields
                .filter((f) => f.section === section)
                .map((field) => {
                  const mandatory = MANDATORY_KEYS.includes(field.key);
                  return (
                    <label key={field.key} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={selected.includes(field.key)}
                        disabled={mandatory}
                        onCheckedChange={() => toggle(field.key)}
                      />
                      <span className={mandatory ? "text-muted-foreground" : ""}>
                        {field.label}
                        {mandatory && " (always asked)"}
                        {!field.is_core && " · custom"}
                      </span>
                    </label>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      {selected.map((key) => (
        <input key={key} type="hidden" name="fieldKeys" value={key} />
      ))}

      {state.error && <FormMessage error={state.error} />}
      {state.success && <FormMessage success={state.success} />}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create form"}
        </Button>
      </div>
    </form>
  );
}
