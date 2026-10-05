"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { ConditionBuilder, type ConditionFieldOptions } from "@/components/rules/condition-builder";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ConditionField } from "@/lib/assignment/evaluate-conditions";

import { createTemperatureRule, type RuleFormState } from "./actions";

const initialState: RuleFormState = {};

/**
 * The last screen in this application that asked somebody to write JSON.
 *
 * `ConditionBuilder` was built for the assignment rules, which store the
 * identical `{"all": […]}` shape and are read by the identical evaluator.
 * This form kept its textarea for no reason other than nobody coming
 * back to it — and the manual grew a paragraph calling this "the one
 * genuinely technical screen", advising admins to leave the shipped
 * rules alone. Which is a documented admission that a configurable thing
 * was not configurable.
 *
 * The server action already validated with `parseConditions`, so nothing
 * behind this file changed: same posted field, same shape, same checks.
 */
export function RuleForm({
  temperatureOptions,
  fields,
  optionsByField,
}: {
  temperatureOptions: Array<{ value: string; label: string }>;
  fields: ConditionField[];
  optionsByField: ConditionFieldOptions;
}) {
  const [state, formAction, pending] = useActionState(createTemperatureRule, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-dashed p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="temperatureValue">Sets temperature to</Label>
          <Combobox
            name="temperatureValue"
            required
            options={temperatureOptions}
            placeholder="Pick a value"
            searchPlaceholder="Type to search…"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="priority">Priority</Label>
          <Input id="priority" name="priority" type="number" min={0} defaultValue={0} required />
          <p className="text-xs text-muted-foreground">
            A lead gets the temperature of the <strong>first</strong> rule it matches, highest
            priority first. A catch-all belongs at the bottom, on 0.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t pt-4">
        <Label>Which leads</Label>
        <p className="text-xs text-muted-foreground">
          Every condition has to be true. Run nightly — a counsellor&apos;s manual override still
          wins while it is in effect.
        </p>
        <ConditionBuilder name="conditions" fields={fields} optionsByField={optionsByField} />
      </div>

      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Adding..." : "Add rule"}
      </Button>
    </form>
  );
}
