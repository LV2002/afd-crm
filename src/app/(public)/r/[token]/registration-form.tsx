"use client";

import { CheckCircle2 } from "lucide-react";
import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PublicFormField } from "@/lib/registration/get-form";
import { submitRegistration, type SubmitState } from "@/lib/registration/submit";

const initialState: SubmitState = {};

/**
 * Rendered from the form's configured fields, not a hardcoded list, so an
 * admin changes what is asked by editing the form — no deploy.
 *
 * Inputs are plain HTML rather than the app's DynamicFieldInput: this page
 * is filled in by a student on a phone, often on a poor connection, and it
 * should work with as little JavaScript as possible. Native `required`,
 * `type="tel"` and `<select>` give better mobile keyboards and validation
 * than a custom widget would.
 */
function Field({ field }: { field: PublicFormField }) {
  const id = `field-${field.key}`;
  const required = field.isRequired;

  const input = (() => {
    switch (field.type) {
      case "long_text":
        return <Textarea id={id} name={field.key} required={required} rows={3} />;
      case "select":
        return (
          <select
            id={id}
            name={field.key}
            required={required}
            defaultValue=""
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs md:text-sm"
          >
            <option value="" disabled>
              Select…
            </option>
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );
      case "multiselect":
        return (
          <div className="flex flex-col gap-2">
            {field.options.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-sm">
                <Checkbox name={field.key} value={option.value} />
                {option.label}
              </label>
            ))}
          </div>
        );
      case "boolean":
        return <Checkbox id={id} name={field.key} />;
      case "date":
        return <Input id={id} name={field.key} type="date" required={required} />;
      case "number":
      case "currency":
        return <Input id={id} name={field.key} type="number" required={required} />;
      case "phone":
        return <Input id={id} name={field.key} type="tel" inputMode="tel" required={required} />;
      case "email":
        return <Input id={id} name={field.key} type="email" inputMode="email" required={required} />;
      default:
        return <Input id={id} name={field.key} required={required} />;
    }
  })();

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        {field.label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {input}
      {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
    </div>
  );
}

export function RegistrationForm({ token, fields }: { token: string; fields: PublicFormField[] }) {
  const [state, action, pending] = useActionState(submitRegistration, initialState);

  if (state.success) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
        <CheckCircle2 className="size-8 text-emerald-600" />
        <p className="text-sm font-medium">{state.success}</p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />

      {/*
        Honeypot. Hidden from people, irresistible to naive bots that fill
        every input they find. `tabIndex={-1}` and autoComplete="off" keep
        it out of the way of anyone using a keyboard or a password manager;
        aria-hidden keeps it out of screen readers.
      */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {fields.map((field) => (
        <Field key={field.key} field={field} />
      ))}

      {state.error && <FormMessage error={state.error} />}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Submitting…" : "Submit"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Your details are used only to contact you about your enquiry.
      </p>
    </form>
  );
}
