"use client";

import { useActionState } from "react";

import { DynamicFieldInput } from "@/components/fields/dynamic-field-input";
import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { fieldInputName } from "@/lib/contacts/form";
import type { FieldSchemaEntry } from "@/lib/fields/get-field-schema";
import { groupBySection } from "@/lib/fields/group-by-section";
import type { FieldOption } from "@/lib/fields/resolve-field-options";

import type { DatabaseFormState } from "./actions";

const initial: DatabaseFormState = {};

/**
 * One form for adding a contact and for editing one. Every input is drawn
 * from the lead field definitions, so a field added to leads in Settings is
 * on this form the moment it exists.
 */
export function ContactForm({
  action,
  fields,
  optionsByKey,
  defaults,
  lists,
  contactId,
  submitLabel,
}: {
  action: (prev: DatabaseFormState, formData: FormData) => Promise<DatabaseFormState>;
  fields: FieldSchemaEntry[];
  optionsByKey: Record<string, FieldOption[]>;
  /** Current values by lead field key (name, phone, email and the rest). */
  defaults: Record<string, unknown>;
  /** Present when adding: which list the person goes on. */
  lists?: Array<{ id: string; name: string }>;
  /** Present when editing. */
  contactId?: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const sections = groupBySection(fields);

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-6">
      {contactId && <input type="hidden" name="id" value={contactId} />}

      {lists && (
        <section className="flex flex-col gap-2 rounded-lg border bg-card p-5">
          <Field
            label="Add to list"
            htmlFor="listId"
            required
            hint="Where this person came from. The list also decides the source if they become a lead."
          >
            <select
              id="listId"
              name="listId"
              required
              defaultValue={lists.length === 1 ? lists[0].id : ""}
              className="h-10 rounded-md border border-input bg-card px-3 text-sm"
            >
              {lists.length !== 1 && <option value="">Choose a list…</option>}
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        </section>
      )}

      {sections.map((section) => (
        <section key={section.section} className="flex flex-col gap-4 rounded-lg border bg-card p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{section.section}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {section.fields.map((field) => (
              <Field
                key={field.key}
                label={field.label}
                htmlFor={fieldInputName(field.key)}
                required={field.key === "student_name"}
                hint={field.helpText}
                className={field.type === "multiselect" || field.type === "long_text" ? "sm:col-span-2" : undefined}
              >
                <DynamicFieldInput
                  field={field}
                  name={fieldInputName(field.key)}
                  defaultValue={defaults[field.key]}
                  options={optionsByKey[field.key] ?? []}
                />
              </Field>
            ))}
          </div>
        </section>
      ))}

      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
