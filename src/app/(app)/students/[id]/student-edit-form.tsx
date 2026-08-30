"use client";

import { useActionState, useState } from "react";

import { DynamicFieldInput } from "@/components/fields/dynamic-field-input";
import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { FieldSection } from "@/lib/fields/group-by-section";
import type { FieldOption } from "@/lib/fields/resolve-field-options";
import { cn } from "@/lib/utils";

import { updateStudent, type FormState } from "./actions";

const initialState: FormState = {};

/** Same one-<form>-per-section-tab shape as LeadEditForm, simplified: no phone-reveal masking (students aren't subject to CLAUDE.md's bulk-phone-masking concern — see students/page.tsx's own comment) and no state/district cascade widget. */
export function StudentEditForm({
  studentId,
  sections,
  values,
  optionsByKey,
}: {
  studentId: string;
  sections: FieldSection[];
  values: Record<string, unknown>;
  optionsByKey: Record<string, FieldOption[]>;
}) {
  const [state, formAction, pending] = useActionState(updateStudent.bind(null, studentId), initialState);
  const [activeSection, setActiveSection] = useState(sections[0]?.section ?? "");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1 border-b">
        {sections.map((section) => (
          <button
            key={section.section}
            type="button"
            onClick={() => setActiveSection(section.section)}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px",
              section.section === activeSection
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {section.section}
          </button>
        ))}
      </div>

      {sections.map((section) => (
        <div
          key={section.section}
          className={cn("grid gap-4 sm:grid-cols-2", section.section === activeSection ? "grid" : "hidden")}
        >
          {section.fields.map((field) => (
            <div key={field.id} className="flex flex-col gap-2">
              <Label>{field.label}</Label>
              {field.isEditable ? (
                <DynamicFieldInput
                  field={field}
                  name={field.key}
                  defaultValue={values[field.key]}
                  options={optionsByKey[field.key] ?? []}
                />
              ) : (
                <p className="text-sm text-muted-foreground">{String(values[field.key] ?? "—")}</p>
              )}
              {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
            </div>
          ))}
        </div>
      ))}

      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
