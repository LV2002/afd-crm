"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/smart-inputs";

import { saveTargets, type TargetFormState } from "./actions";

const initialState: TargetFormState = {};

export interface TargetRowValues {
  leads: string;
  admissions: string;
  /** Rupees, not paise — the conversion happens in the action. */
  revenue: string;
}

/**
 * One scope's three numbers, saving on its own.
 *
 * Per-row rather than one big form for the whole page: an institute with
 * two centres and ten counsellors would otherwise have thirty-nine boxes
 * behind a single Save, where one bad entry loses the other thirty-eight.
 *
 * An empty box means no target, and the hint says so — the difference
 * between "we did not set one" and "we aimed for zero" is the difference
 * between a dash and a permanent failure on the reports.
 */
export function TargetRow({
  month,
  kind,
  scopeId,
  label,
  hint,
  values,
}: {
  month: string;
  kind: "org" | "center" | "owner";
  scopeId: string | null;
  label: string;
  hint: string;
  values: TargetRowValues;
}) {
  const [state, action, pending] = useActionState(saveTargets, initialState);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border p-4">
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="kind" value={kind} />
      {scopeId && <input type="hidden" name="scopeId" value={scopeId} />}

      <div>
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label="Admissions"
          htmlFor={`admissions-${kind}-${scopeId ?? "org"}`}
          hint="Leave empty for no target."
        >
          <Input
            id={`admissions-${kind}-${scopeId ?? "org"}`}
            name="admissions"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            defaultValue={values.admissions}
            placeholder="—"
          />
        </Field>

        <Field
          label="New leads"
          htmlFor={`leads-${kind}-${scopeId ?? "org"}`}
          hint="Leave empty for no target."
        >
          <Input
            id={`leads-${kind}-${scopeId ?? "org"}`}
            name="leads"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            defaultValue={values.leads}
            placeholder="—"
          />
        </Field>

        <Field
          label="Fees collected"
          htmlFor={`revenue-${kind}-${scopeId ?? "org"}`}
          hint="In rupees. Leave empty for no target."
        >
          <MoneyInput
            id={`revenue-${kind}-${scopeId ?? "org"}`}
            name="revenue"
            defaultValue={values.revenue}
            placeholder="—"
          />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          <Save className="size-4" />
          {pending ? "Saving…" : "Save"}
        </Button>
        <FormMessage error={state.error} success={state.success} />
      </div>
    </form>
  );
}
