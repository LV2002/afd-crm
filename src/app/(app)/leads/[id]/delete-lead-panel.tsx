"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { deleteLead, type FormState } from "./actions";

const initial: FormState = {};

/**
 * The one destructive control on the lead page, and it behaves like one.
 *
 * Closed by default, because a delete button sitting open under a form
 * somebody edits forty times a day will eventually be clicked by mistake.
 * Opening it asks for a reason, and the reason is what makes the button
 * safe: having to type "test row from the webhook trial" is a moment's
 * thought about whether this is really a deletion, and it is the only thing
 * that will answer the question three months from now.
 *
 * No modal. A modal would be the same number of clicks with a focus trap to
 * get wrong, and this form has to be readable on a phone.
 */
export function DeleteLeadPanel({ leadId, leadName }: { leadId: string; leadName: string }) {
  const [state, action, pending] = useActionState(deleteLead, initial);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-4">
        <p className="text-sm text-muted-foreground">
          Delete this lead if it should never have been here — a test row, a spam form fill, junk.
          It stays recoverable.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Trash2 className="size-4" />
          Delete lead
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-destructive/40 p-4">
      <input type="hidden" name="leadId" value={leadId} />
      <div>
        <p className="text-sm font-medium">Delete {leadName}?</p>
        <p className="text-sm text-muted-foreground">
          They disappear from every list and report. An administrator can put them back from{" "}
          <strong>Leads → Deleted</strong>, and nothing about their history is destroyed.
        </p>
        {/*
          Said here rather than discovered afterwards. Deleting one of two
          records for the same person loses whichever history was on the one
          that went — merging keeps both.
        */}
        <p className="mt-2 text-sm text-muted-foreground">
          <strong>Is this the same person as another lead?</strong> Merge them instead, from Leads →
          Merge review. Deleting a duplicate throws away whatever was recorded against it.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reason">Why are you deleting it?</Label>
        <Input
          id="reason"
          name="reason"
          required
          minLength={3}
          maxLength={500}
          placeholder="Test row from the webhook trial"
        />
      </div>

      {state.error && <FormMessage error={state.error} />}

      <div className="flex gap-2">
        <Button type="submit" variant="destructive" size="sm" disabled={pending}>
          {pending ? "Deleting…" : "Delete lead"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
