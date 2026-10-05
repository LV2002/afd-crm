"use client";

import { Plus } from "lucide-react";
import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { saveCustomWebhook, type WebhookFormState } from "./actions";

const initialState: WebhookFormState = {};

/**
 * Deliberately two fields.
 *
 * Everything else about an endpoint — the sub-source, the centre, the
 * unusual field names, whether it signs — only matters once you have the
 * URL and can see what the sender actually posts. Asking for all of it up
 * front is how a setup screen becomes something people put off.
 *
 * Signature checking is on by default and not offered here: it is the
 * right answer, and the one place to turn it off is beside the warning
 * that says what it costs.
 */
export function NewWebhookForm({ centers }: { centers: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState(saveCustomWebhook, initialState);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-name">Name</Label>
          <Input id="new-name" name="name" required placeholder="Knorish course purchases" />
          <p className="text-xs text-muted-foreground">
            For you, on this screen. Something you will recognise in six months.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-source">Source name</Label>
          <Input id="new-source" name="source" required placeholder="Knorish" />
          <p className="text-xs text-muted-foreground">
            Stamped on every lead from this endpoint, and added to the Lead source dropdown so the
            reports can group by it.
          </p>
        </div>
      </div>

      {/*
        Hidden rather than absent: the action reads them, and leaving them
        out of the form would make "no centre" look like a decision the
        admin made instead of the default it is.
      */}
      <input type="hidden" name="subSource" value="" />
      <input type="hidden" name="centerId" value="" />
      <input type="hidden" name="fieldAliases" value="" />
      <input type="hidden" name="requireSignature" value="on" />

      <FormMessage error={state.error} success={state.success} />

      <Button type="submit" disabled={pending} className="w-fit">
        <Plus className="size-4" />
        {pending ? "Creating…" : "Create endpoint"}
      </Button>

      <p className="text-xs text-muted-foreground">
        {centers.length === 0
          ? "Signature checking is on. You can change that, and pick a centre, after it exists."
          : "Signature checking is on. You can change that, pick a centre, and add unusual field names after it exists."}
      </p>
    </form>
  );
}
