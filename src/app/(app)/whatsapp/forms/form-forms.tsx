"use client";

import { useActionState, useState, useTransition } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { createForm, deleteForm, publishForm, type FormState } from "./actions";

export function NewFormForm({ fieldChoices }: { fieldChoices: Array<{ value: string; label: string }> }) {
  const [state, action, pending] = useActionState(createForm, {} as FormState);
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">New form</h3>
      <Input name="name" placeholder="Name, e.g. Admission enquiry" aria-label="Name" className="h-9" />
      <Textarea name="introText" rows={2} maxLength={1024} placeholder="Message that comes with the form, e.g. Please share a few details so we can guide you." aria-label="Message" />
      <Input name="buttonLabel" placeholder="Button words (20 max), e.g. Fill the form" maxLength={20} className="h-9 w-64" aria-label="Button" />
      <fieldset className="flex flex-col gap-1">
        <legend className="text-xs text-muted-foreground">What to ask (up to 8). Answers are checked and saved onto the lead.</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {fieldChoices.map((f) => (
            <label key={f.value} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="fields" value={f.value} /> {f.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>Save form</Button>
        <FormMessage error={state.error} success={state.success} />
      </div>
    </form>
  );
}

export function FormRowActions({ id, published }: { id: string; published: boolean }) {
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        {!published && (
          <Button size="sm" disabled={pending} onClick={() => start(async () => setState(await publishForm(id)))}>
            {pending ? "Publishing…" : "Publish to WhatsApp"}
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => setState(await deleteForm(id)))}>Remove</Button>
      </div>
      <FormMessage error={state.error} success={state.success} />
    </div>
  );
}
