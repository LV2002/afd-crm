"use client";

import { useActionState, useTransition } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { addSuppression, releaseSuppression, type SuppressionFormState } from "./actions";

const initialState: SuppressionFormState = {};

/** For an opt-out somebody gave on a call, at the desk, or by email rather than by messaging STOP. */
export function AddSuppressionForm() {
  const [state, formAction, pending] = useActionState(addSuppression, initialState);

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">Record an opt-out</h3>
      <p className="text-sm text-muted-foreground">
        For somebody who asked in person or on a call. Anyone who messages STOP is added here
        automatically.
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="suppression-phone">Phone number</Label>
        <Input id="suppression-phone" name="phone" required placeholder="+91 98765 43210" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="suppression-reason">Note (optional)</Label>
        <Input id="suppression-reason" name="reason" placeholder="Asked at the front desk" />
      </div>
      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving…" : "Add"}
      </Button>
    </form>
  );
}

export function ReleaseButton({ phone }: { phone: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => start(async () => void (await releaseSuppression(phone)))}
    >
      {pending ? "Allowing…" : "Allow again"}
    </Button>
  );
}
