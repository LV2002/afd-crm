"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { FieldSection } from "@/lib/fields/group-by-section";
import type { FieldOption } from "@/lib/fields/resolve-field-options";

import { updateLead, type FormState } from "./actions";
import { DynamicFieldInput } from "./dynamic-field-input";
import { RevealPhoneButton } from "../reveal-phone-button";
import { StateDistrictFields } from "./state-district-fields";

const initialState: FormState = {};

/**
 * One <form> for every section, tabs just show/hide sections with CSS —
 * switching tabs never drops what you typed in another one, and there's
 * only ever one submit to reason about.
 */
export function LeadEditForm({
  leadId,
  sections,
  values,
  optionsByKey,
  canRevealPhone,
}: {
  leadId: string;
  sections: FieldSection[];
  values: Record<string, unknown>;
  optionsByKey: Record<string, FieldOption[]>;
  canRevealPhone: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateLead.bind(null, leadId), initialState);
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

      {sections.map((section) => {
        const hasStateDistrict =
          section.fields.some((f) => f.key === "state") && section.fields.some((f) => f.key === "district");

        return (
          <div
            key={section.section}
            className={cn("grid gap-4 sm:grid-cols-2", section.section === activeSection ? "grid" : "hidden")}
          >
            {hasStateDistrict && (
              <StateDistrictFields
                stateName="state"
                districtName="district"
                defaultState={(values.state as string) ?? ""}
                defaultDistrict={(values.district as string) ?? ""}
              />
            )}
            {section.fields
              .filter((field) => !(hasStateDistrict && (field.key === "state" || field.key === "district")))
              .map((field) => (
                <div key={field.id} className="flex flex-col gap-2">
                  <Label>{field.label}</Label>
                  {field.type === "phone" ? (
                    <RevealPhoneButton
                      leadId={leadId}
                      masked={values[field.key] as string | null}
                      canReveal={canRevealPhone}
                    />
                  ) : field.isEditable ? (
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
        );
      })}

      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
