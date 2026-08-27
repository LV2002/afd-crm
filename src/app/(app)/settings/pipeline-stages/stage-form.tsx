"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { StageFormState } from "./actions";
import { StageTypeSelect } from "./stage-type-select";

export interface StageFormValues {
  name: string;
  color: string;
  stageType: string;
  probability: string;
  slaHours: string;
  requiresReason: boolean;
  requiredFields: string;
}

const initialState: StageFormState = {};

export function StageForm({
  values,
  action,
  submitLabel,
}: {
  values: StageFormValues;
  action: (prevState: StageFormState, formData: FormData) => Promise<StageFormState>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={values.name} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="stageType">Type</Label>
        <StageTypeSelect defaultValue={values.stageType} />
        <p className="text-xs text-muted-foreground">
          Drives behaviour (lost-reason modal, the form link, the won calculation) — the one
          part of a stage that stays a fixed vocabulary.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="color">Colour</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label="Stage colour picker"
            defaultValue={values.color || "#0ea5e9"}
            className="h-9 w-10 shrink-0 rounded border border-input"
            onChange={(e) => {
              const input = document.getElementById("color") as HTMLInputElement | null;
              if (input) input.value = e.target.value;
            }}
          />
          <Input id="color" name="color" defaultValue={values.color} placeholder="#0ea5e9" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="probability">Win probability (%)</Label>
        <Input id="probability" name="probability" type="number" min={0} max={100} defaultValue={values.probability} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="slaHours">SLA hours</Label>
        <Input id="slaHours" name="slaHours" type="number" min={1} defaultValue={values.slaHours} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="requiredFields">Required fields to enter this stage</Label>
        <Input
          id="requiredFields"
          name="requiredFields"
          defaultValue={values.requiredFields}
          placeholder="primary_phone, exam_year"
        />
        <p className="text-xs text-muted-foreground">Comma-separated field keys.</p>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="requiresReason" name="requiresReason" defaultChecked={values.requiresReason} />
        <Label htmlFor="requiresReason" className="font-normal">
          Requires a reason to enter (e.g. Lost)
        </Label>
      </div>
      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
