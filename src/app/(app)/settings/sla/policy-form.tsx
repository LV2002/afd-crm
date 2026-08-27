"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { createSlaPolicy, type SlaFormState } from "./actions";

const MEASURE_LABELS = {
  first_response: "First response",
  next_followup: "Next follow-up",
  in_stage: "Time in stage",
} as const;

const initialState: SlaFormState = {};

export function PolicyForm() {
  const [state, formAction, pending] = useActionState(createSlaPolicy, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-dashed p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" placeholder="Default 24h first response" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="priority">Priority</Label>
          <Input id="priority" name="priority" type="number" min={0} defaultValue={0} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="measure">Measure</Label>
          <Select name="measure" defaultValue="first_response" required>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(MEASURE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="targetHours">Target hours</Label>
          <Input id="targetHours" name="targetHours" type="number" min={1} defaultValue={24} required />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="businessHoursOnly" name="businessHoursOnly" />
        <Label htmlFor="businessHoursOnly" className="font-normal">
          Only count business hours (pauses outside working hours and on holidays)
        </Label>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="appliesTo">Applies to (JSON, empty = everyone)</Label>
        <Textarea
          id="appliesTo"
          name="appliesTo"
          className="font-mono text-xs"
          rows={3}
          placeholder='{ "all": [{ "field": "source", "op": "equals", "value": "Walk-in" }] }'
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="escalations">Escalation ladder (JSON array)</Label>
        <Textarea
          id="escalations"
          name="escalations"
          className="font-mono text-xs"
          rows={4}
          defaultValue={
            '[\n  { "at_hours": 12, "notify_owner": true },\n  { "at_hours": 24, "flag_breach": true }\n]'
          }
        />
      </div>
      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Creating..." : "Create policy"}
      </Button>
    </form>
  );
}
