"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { saveOutcomesSettings, type OutcomesFormState } from "./actions";

const initialState: OutcomesFormState = {};

export interface OutcomesStatus {
  configured: boolean;
  pending: number;
  sent: number;
  setAside: number;
  lastError: string | null;
}

export function OutcomesPanel({ status }: { status: OutcomesStatus }) {
  const [state, formAction, pending] = useActionState(saveOutcomesSettings, initialState);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="outcomes-url">Apps Script address (ends in /exec)</Label>
        <Input
          id="outcomes-url"
          name="execUrl"
          type="url"
          placeholder={status.configured ? "Saved — paste a new one to replace it" : "https://script.google.com/macros/s/…/exec"}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="outcomes-secret">Signing key</Label>
        <Input
          id="outcomes-secret"
          name="secret"
          type="password"
          placeholder={status.configured ? "Saved — leave blank to keep it" : "The key the owner sent you"}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          Stored encrypted. It can&apos;t be shown again; to change it, paste the new one.
        </p>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving…" : "Save"}
      </Button>
      <FormMessage error={state.error} success={state.success} />

      <p className="text-sm text-muted-foreground">
        {status.configured ? "Connected." : "Not connected yet — changes are still queued, and go out once it is."}{" "}
        {status.sent} reported · {status.pending} waiting
        {status.setAside > 0 && ` · ${status.setAside} not reported (not an outcome, or unchanged)`}.
      </p>
      {status.lastError && (
        <p className="text-sm text-destructive">The sheet last answered: {status.lastError}</p>
      )}
    </form>
  );
}
