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
import { MEASURE_COPY, SLA_MEASURES, describeHours, type SlaMeasure } from "@/lib/sla/policy-copy";

import { createSlaPolicy, type SlaFormState } from "./actions";
import { EscalationEditor } from "./escalation-editor";

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
 * What replaced them:
 *
 * 1. **The condition builder** the assignment rules already use, instead
 *    of the first textarea. It was sitting one import away the whole time.
 * 2. **A ladder editor**, instead of the second.
 * 3. **Plain English under every control** — what the clock measures,
 *    when it pauses, and how priority decides which single policy a lead
 *    gets. Hours are said back as days and weeks.
 *
 * What is deliberately *not* here: ready-made policies. An earlier draft
 * offered three, and Leon asked for them out — deciding what an institute
 * measures itself on is his call, not the software's. See
 * lib/sla/policy-copy.ts.
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

  const [measure, setMeasure] = React.useState<SlaMeasure>("first_response");
  const [targetHours, setTargetHours] = React.useState(4);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-dashed p-4">
      <div>
        <h3 className="text-sm font-semibold">Add a policy</h3>
        <p className="text-sm text-muted-foreground">
          Six fields, and only the first two need a decision. Nothing is saved until you press
          Create.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              required
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
              onValueChange={(next) => setMeasure(next as SlaMeasure)}
              required
            >
              <SelectTrigger id="measure">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SLA_MEASURES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {MEASURE_COPY[value].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Under the control, not inside the option: this project's
                SelectItem wraps all its children in Radix ItemText, which
                the closed trigger renders — so an explanation written into
                the option leaks into the trigger. */}
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
              defaultValue={0}
              className="w-28"
            />
            <p className="text-xs text-muted-foreground">
              A lead gets <strong>one</strong> policy: the highest-priority one whose conditions
              it matches. Give a catch-all a low number and your specific policies higher ones.
            </p>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <Checkbox name="businessHoursOnly" defaultChecked className="mt-0.5" />
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
          <ConditionBuilder name="appliesTo" fields={fields} optionsByField={optionsByField} />
        </div>

        <div className="flex flex-col gap-2 border-t pt-4">
          <Label>When it is missed</Label>
          <EscalationEditor />
        </div>

        <FormMessage error={state.error} success={state.success} />
        <Button type="submit" disabled={pending} className="w-fit">
          {pending ? "Creating…" : "Create policy"}
        </Button>
      </form>
    </div>
  );
}
