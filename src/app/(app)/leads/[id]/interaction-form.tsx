"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";
import type { FieldOption } from "@/lib/fields/resolve-field-options";
import { needsFollowUp } from "@/lib/leads/interaction-follow-up";

import { logInteraction, type FormState } from "./actions";

const initialState: FormState = {};

/**
 * Logging what was said, and what happens next.
 *
 * **Next action and its date are both required**, and neither has a
 * default. A call that ends with nothing scheduled is a lead that quietly
 * stops being worked — nothing surfaces it in the morning queue and
 * nobody notices until a report counts it months later.
 *
 * The exemption is the outcome with nowhere left to go: pick
 * **Converted** and both fields relax, because the student has joined and
 * there is no next call. Everything else, including leaving the outcome
 * blank, needs a follow-up.
 *
 * The same rule is applied again in `logInteraction()` and again by the
 * CHECK constraint on `interactions` (migrations 0009 and 0087), so this
 * is the courteous half of three, not the enforcement.
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
  const [state, formAction, pending] = useActionState(
    logInteraction.bind(null, leadId),
    initialState,
  );
  const [outcome, setOutcome] = useState("");
  const required = needsFollowUp(outcome);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">Log an interaction</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="interaction-type">Type</Label>
          <Combobox
            id="interaction-type"
            name="type"
            required
            options={types}
            placeholder="Select type"
            searchPlaceholder="Type to search…"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="interaction-outcome">Outcome</Label>
          <Combobox
            id="interaction-outcome"
            name="outcome"
            value={outcome}
            onChange={setOutcome}
            options={outcomes}
            placeholder="Select outcome"
            searchPlaceholder="Type to search…"
            clearable
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="interaction-notes">Notes</Label>
        <Textarea id="interaction-notes" name="notes" rows={2} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="interaction-next-action">
          Next action {required && <span className="text-destructive">*</span>}
        </Label>
        <Textarea id="interaction-next-action" name="nextAction" rows={2} required={required} />
      </div>

      <div className="flex flex-col gap-2 sm:w-64">
        <Label htmlFor="interaction-next-followup">
          Next follow-up {required && <span className="text-destructive">*</span>}
        </Label>
        <Input
          id="interaction-next-followup"
          type="datetime-local"
          name="nextFollowupAt"
          required={required}
        />
      </div>

      {!required && (
        <p className="text-sm text-muted-foreground">
          No follow-up needed — they have joined.
        </p>
      )}

      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Logging…" : "Log interaction"}
      </Button>
    </form>
  );
}
