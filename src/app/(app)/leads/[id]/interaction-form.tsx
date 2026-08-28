"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FieldOption } from "@/lib/fields/resolve-field-options";

import { logInteraction, type FormState } from "./actions";

const initialState: FormState = {};

/**
 * "Next action" has no default and no way to skip it — it's the one field
 * this form treats as non-negotiable, matching the CHECK constraint on
 * `interactions` itself (migration 0009) so the enforcement isn't only
 * client-side.
 */
export function InteractionForm({
  leadId,
  types,
  outcomes,
}: {
  leadId: string;
  types: FieldOption[];
  outcomes: FieldOption[];
}) {
  const [state, formAction, pending] = useActionState(logInteraction.bind(null, leadId), initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">Log an interaction</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="interaction-type">Type</Label>
          <Select name="type" required>
            <SelectTrigger id="interaction-type">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {types.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="interaction-outcome">Outcome</Label>
          <Select name="outcome">
            <SelectTrigger id="interaction-outcome">
              <SelectValue placeholder="Select outcome" />
            </SelectTrigger>
            <SelectContent>
              {outcomes.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="interaction-notes">Notes</Label>
        <Textarea id="interaction-notes" name="notes" rows={2} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="interaction-next-action">
          Next action <span className="text-destructive">*</span>
        </Label>
        <Textarea id="interaction-next-action" name="nextAction" rows={2} required />
      </div>

      <div className="flex flex-col gap-2 sm:w-64">
        <Label htmlFor="interaction-next-followup">Next follow-up</Label>
        <Input id="interaction-next-followup" type="datetime-local" name="nextFollowupAt" />
      </div>

      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Logging…" : "Log interaction"}
      </Button>
    </form>
  );
}
