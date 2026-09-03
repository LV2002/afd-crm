"use client";

import { CheckCircle2 } from "lucide-react";
import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProfileFormField } from "@/lib/profile-form/get-form";
import { submitProfileForm, type ProfileSubmitState } from "@/lib/profile-form/submit";

const initialState: ProfileSubmitState = {};

/**
 * Plain HTML inputs rather than the app's DynamicFieldInput: a student
 * fills this in on a phone, often on a poor connection. Native `required`,
 * `type="tel"` and `<select>` give better mobile keyboards and validation
 * than a custom widget, and the page works with almost no JavaScript.
 */
function Field({ field }: { field: ProfileFormField }) {
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

export function ProfileFormFields({
  token,
  fields,
}: {
  token: string;
  fields: ProfileFormField[];
}) {
  const [state, action, pending] = useActionState(submitProfileForm, initialState);

  if (state.success) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
        <CheckCircle2 className="size-8 text-emerald-600" />
        <p className="text-sm font-medium">{state.success}</p>
        <p className="text-xs text-muted-foreground">
          Your centre will be in touch about the next step, which is the fee payment.
        </p>
      </div>
    );
  }

  // Grouped by the section each field belongs to, so a 30-field form reads
  // as a few short blocks rather than one intimidating column.
  const sections = [...new Set(fields.map((f) => f.section))];

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="token" value={token} />

      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {sections.map((section) => (
        <section key={section} className="flex flex-col gap-4 rounded-lg border p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {section}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields
              .filter((f) => f.section === section)
              .map((field) => (
                <Field key={field.key} field={field} />
              ))}
          </div>
        </section>
      ))}

      {state.error && <FormMessage error={state.error} />}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Submitting…" : "Submit my details"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Your details are used only for your admission and course records.
      </p>
    </form>
  );
}
