"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { FieldSection } from "@/lib/fields/group-by-section";
import type { FieldOption } from "@/lib/fields/resolve-field-options";

import { DynamicFieldInput } from "@/components/fields/dynamic-field-input";

import { updateLead, type FormState } from "./actions";
import { PhoneField } from "./phone-field";
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
  leadRefLabel,
}: {
  leadId: string;
  sections: FieldSection[];
  values: Record<string, unknown>;
  optionsByKey: Record<string, FieldOption[]>;
  canRevealPhone: boolean;
  /** Resolved server-side so a referrer already on the record shows as a name. */
  leadRefLabel?: { id: string; name: string; phone: string; hint: string } | null;
}) {
  const [state, formAction, pending] = useActionState(updateLead.bind(null, leadId), initialState);
  const [activeSection, setActiveSection] = useState(sections[0]?.section ?? "");

  /*
    Autosave, because Save changes was being missed.

    Stage and temperature have saved on the spot since the status bar was
    built, and the thirty fields underneath them did not — so a counsellor
    who corrected an exam year, got pulled onto a call and came back to
    the lead later found their correction gone, with nothing having said
    so. Leon asked for the rest of the profile to behave like the two
    controls that already do.

    **The whole form is submitted, not the one field that changed.** The
    action is idempotent, it already skips fields a form did not render
    (`NOT_PROVIDED`), and sending everything means autosave and the button
    take exactly the same path — so there is no second code path to keep
    in step, and no field that saves one way and not the other.

    **On blur and on change, not per keystroke.** A save per character
    would be a request per character and a validation error flashing while
    somebody is still halfway through typing a phone number. `change` is
    what a select, a checkbox and a date picker fire when the value is
    settled; `blur` is when a text box is finished with.
  */
  const formRef = useRef<HTMLFormElement>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function autosave() {
    const form = formRef.current;
    if (!form || pending) return;
    // `requestSubmit`, never `submit`: it runs the action React has bound
    // to the form, and respects a field that is still invalid.
    form.requestSubmit();
  }

  useEffect(() => {
    if (state.success) setSavedAt(Date.now());
  }, [state.success]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-4"
      onBlur={(event) => {
        // Only when focus actually leaves the control — React's onBlur
        // bubbles, so moving between two inputs inside one field would
        // otherwise fire twice.
        if (event.target instanceof HTMLElement && event.target.closest("form") === formRef.current) {
          autosave();
        }
      }}
      onChange={(event) => {
        const target = event.target as HTMLElement;
        // A text box saves when it is left, not while it is being typed
        // in. Everything else has settled by the time it fires `change`.
        const isFreeText =
          target instanceof HTMLInputElement &&
          !["checkbox", "radio", "date", "datetime-local", "file"].includes(target.type);
        if (!isFreeText && !(target instanceof HTMLTextAreaElement)) autosave();
      }}
    >
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
            /*
              `items-start` and `auto-rows-min`: without them a short
              field stretches to match the tall multiselect beside it, so
              a section with one long list is mostly empty space with a
              few labels floating in the middle of it. `xl:grid-cols-3`
              because these sections are 4 to 13 fields and a wide screen
              was showing two.
            */
            className={cn(
              "grid auto-rows-min items-start gap-4 sm:grid-cols-2 xl:grid-cols-3",
              section.section === activeSection ? "grid" : "hidden",
            )}
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
                    <PhoneField
                      leadId={leadId}
                      name={field.key}
                      masked={values[field.key] as string | null}
                      canReveal={canRevealPhone}
                      // Editing a number you may not reveal would mean
                      // overwriting a value you cannot see, so the two
                      // permissions travel together — `updateLead`
                      // enforces the same pairing server-side.
                      canEdit={field.isEditable && canRevealPhone}
                      chatHref={
                        field.key === "whatsapp_phone" || field.key === "primary_phone"
                          ? `/whatsapp?thread=${encodeURIComponent(`lead:${leadId}`)}`
                          : undefined
                      }
                    />
                  ) : field.isEditable ? (
                    <DynamicFieldInput
                      field={field}
                      name={field.key}
                      defaultValue={values[field.key]}
                      options={optionsByKey[field.key] ?? []}
                      leadRefLabel={field.type === "lead_ref" ? (leadRefLabel ?? null) : null}
                      excludeLeadId={leadId}
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

      {/*
        The error still shows. The success does not: a toast on every
        blur, thirty fields deep, is a screen that flickers all day. The
        quiet line below is the acknowledgement instead.
      */}
      <FormMessage error={state.error} />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="w-fit">
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <span aria-live="polite" className="text-xs text-muted-foreground">
          {pending ? "Saving…" : savedAt ? "Saved" : "Changes save as you go"}
        </span>
      </div>
    </form>
  );
}
