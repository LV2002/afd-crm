"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { createTemperatureRule, type RuleFormState } from "./actions";

const initialState: RuleFormState = {};

export function RuleForm({ temperatureOptions }: { temperatureOptions: Array<{ value: string; label: string }> }) {
  const [state, formAction, pending] = useActionState(createTemperatureRule, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-dashed p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="temperatureValue">Sets temperature to</Label>
          <Select name="temperatureValue" required>
            <SelectTrigger>
              <SelectValue placeholder="Pick a value" />
            </SelectTrigger>
            <SelectContent>
              {temperatureOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="priority">Priority</Label>
          <Input id="priority" name="priority" type="number" min={0} defaultValue={0} required />
          <p className="text-xs text-muted-foreground">First match by priority wins.</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="conditions">Conditions (JSON)</Label>
        <Textarea
          id="conditions"
          name="conditions"
          className="font-mono text-xs"
          rows={4}
          defaultValue={'{\n  "all": [\n    { "field": "stage_rank", "op": "gt", "value": 5 }\n  ]\n}'}
          required
        />
        <p className="text-xs text-muted-foreground">
          Same AND-array grammar as assignment rules. Evaluated by the nightly recompute job
          (Phase 2) — this screen only stores the configuration.
        </p>
      </div>
      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Adding..." : "Add rule"}
      </Button>
    </form>
  );
}
