"use client";

import * as React from "react";
import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { ConditionBuilder, type ConditionFieldOptions } from "@/components/rules/condition-builder";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ConditionField } from "@/lib/assignment/evaluate-conditions";
import { MEASURE_COPY, SLA_PRESETS, describeHours, type SlaPreset } from "@/lib/sla/presets";

import { createSlaPolicy, type SlaFormState } from "./actions";
import { EscalationEditor, type EscalationRow } from "./escalation-editor";

const initialState: SlaFormState = {};

/**
 * Creating a response-time policy, without writing JSON.
 *
 * The old form had two textareas: "Applies to (JSON, empty = everyone)"
 * and "Escalation ladder (JSON array)". Both asked an administrator to
 * hand-write a structure whose keys are documented in a schema comment,
 * and one of them taught a key — `flag_breach` — that nothing reads. The
 * result was predictable: the feature existed and nobody made a policy.
 *
 * Three things changed, in order of how much they matter:
 *
 * 1. **Presets.** The hard part was never the typing, it was knowing what
 *    a reasonable target is. Three policies a coaching institute would
 *    recognise fill the form in; everything stays editable afterwards.
 * 2. **The condition builder** the assignment rules already use, instead
 *    of the JSON textarea. It was sitting one import away the whole time.
 * 3. **A ladder editor**, instead of the other JSON textarea.
 *
 * Nothing about the stored shape changed, so existing policies and the
 * hourly sweep are untouched.
 */
export function PolicyForm({
  fields,
  optionsByField,
}: {
  fields: ConditionField[];
  optionsByField: ConditionFieldOptions;
}) {
  const [state, formAction, pending] = useActionState(createSlaPolicy, initialState);

  const [preset, setPreset] = React.useState<SlaPreset | null>(null);
  const [measure, setMeasure] = React.useState<SlaPreset["measure"]>("first_response");
  const [targetHours, setTargetHours] = React.useState(4);
  const [businessHoursOnly, setBusinessHoursOnly] = React.useState(true);
  const [name, setName] = React.useState("");
  const [priority, setPriority] = React.useState(0);
  const [escalations, setEscalations] = React.useState<EscalationRow[]>([]);

  /**
   * Remounts the two sub-editors when a preset is chosen.
   *
   * Both keep their own state from their initial props — which is right
   * while somebody is editing and wrong the moment a preset replaces what
   * they were editing. Changing the key is the honest way to say "this is
   * a different form now".
   */
  const [formKey, setFormKey] = React.useState(0);

  function apply(chosen: SlaPreset) {
    setPreset(chosen);
    setName(chosen.name);
    setMeasure(chosen.measure);
    setTargetHours(chosen.targetHours);
    setBusinessHoursOnly(chosen.businessHoursOnly);
    setPriority(chosen.priority);
    setEscalations(chosen.escalations);
    setFormKey((value) => value + 1);
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-dashed p-4">
      <div>
        <h3 className="text-sm font-semibold">Add a policy</h3>
        <p className="text-sm text-muted-foreground">
          Start from one of these and change what you disagree with, or fill it in yourself.
          Nothing is saved until you press Create.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {SLA_PRESETS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => apply(option)}
            className={
              preset?.key === option.key
                ? "flex flex-col gap-1 rounded-lg border-2 border-primary bg-primary/5 p-3 text-left"
                : "flex flex-col gap-1 rounded-lg border p-3 text-left hover:bg-accent"
            }
          >
            <span className="text-sm font-medium">{option.name}</span>
            <span className="text-xs text-muted-foreground">
              {MEASURE_COPY[option.measure].label} · {describeHours(option.targetHours)}
            </span>
            <span className="mt-1 text-xs text-muted-foreground">{option.rationale}</span>
          </button>
        ))}
      </div>

      <form action={formAction} className="flex flex-col gap-4 border-t pt-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Answer a new enquiry the same day"
            />
            <p className="text-xs text-muted-foreground">
              What you would call it out loud. It appears on the policy list and nowhere else.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="measure">What it measures</Label>
            <Select
              name="measure"
              value={measure}
              onValueChange={(next) => setMeasure(next as SlaPreset["measure"])}
              required
            >
              <SelectTrigger id="measure">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(MEASURE_COPY).map(([value, copy]) => (
                  <SelectItem key={value} value={value}>
                    {copy.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{MEASURE_COPY[measure].clock}</p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="targetHours">Target</Label>
            <div className="flex items-center gap-2">
              <Input
                id="targetHours"
                name="targetHours"
                type="number"
                min={1}
                required
                value={targetHours}
                onChange={(event) => setTargetHours(Number(event.target.value))}
                className="w-28"
              />
              <span className="text-sm text-muted-foreground">
                hours — {describeHours(targetHours)}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="priority">Priority</Label>
            <Input
              id="priority"
              name="priority"
              type="number"
              min={0}
              required
              value={priority}
              onChange={(event) => setPriority(Number(event.target.value))}
              className="w-28"
            />
            <p className="text-xs text-muted-foreground">
              A lead gets <strong>one</strong> policy: the highest-priority one whose conditions
              it matches. Give a catch-all a low number and your specific policies higher ones.
            </p>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            name="businessHoursOnly"
            checked={businessHoursOnly}
            onCheckedChange={(next) => setBusinessHoursOnly(next === true)}
            className="mt-0.5"
          />
          <span>
            Count working hours only
            <span className="block text-xs text-muted-foreground">
              The clock pauses overnight, on weekly offs and on holidays, using the hours set
              below. Without this, a Saturday-evening enquiry is four hours late by Sunday
              morning with nobody in the building.
            </span>
          </span>
        </label>

        <div className="flex flex-col gap-2 border-t pt-4">
          <Label>Which leads</Label>
          <p className="text-xs text-muted-foreground">
            Every condition has to be true. Leave it empty and the policy covers everybody, which
            is what you want for your first one.
          </p>
          <ConditionBuilder
            key={`conditions-${formKey}`}
            name="appliesTo"
            fields={fields}
            optionsByField={optionsByField}
          />
        </div>

        <div className="flex flex-col gap-2 border-t pt-4">
          <Label>When it is missed</Label>
          <EscalationEditor key={`escalations-${formKey}`} defaultRows={escalations} />
        </div>

        <FormMessage error={state.error} success={state.success} />
        <Button type="submit" disabled={pending} className="w-fit">
          {pending ? "Creating…" : "Create policy"}
        </Button>
      </form>
    </div>
  );
}
