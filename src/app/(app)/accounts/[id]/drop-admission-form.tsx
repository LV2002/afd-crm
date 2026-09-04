"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { dropAdmissionAction, type FormState } from "./actions";

const initialState: FormState = {};

/**
 * Recording that a student left, and undoing it.
 *
 * The reason is required. Three departments read this — the counsellor
 * who sold it, accounts who stop chasing the fee, academics who take them
 * off the register — and "dropped" with no explanation starts three
 * conversations instead of ending them.
 */
export function DropAdmissionForm({
  enrolmentId,
  isDropped,
}: {
  enrolmentId: string;
  isDropped: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    dropAdmissionAction.bind(null, enrolmentId),
    initialState,
  );

  if (isDropped) {
    return (
      <form action={formAction} className="flex flex-col gap-3 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">Marked as dropped</h3>
        <p className="text-sm text-muted-foreground">
          Restore this only if it was recorded against the wrong student. The admission counts
          again and the fee goes back on the collections list; payments already recorded are
          untouched either way.
        </p>
        <input type="hidden" name="intent" value="restore" />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Restoring…" : "Restore this admission"}
        </Button>
        <FormMessage error={state.error} success={state.success} />
      </form>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">Student dropped out</h3>
      <div className="flex flex-col gap-2">
        <Label htmlFor="drop-reason">Why did they leave?</Label>
        <Textarea
          id="drop-reason"
          name="reason"
          required
          rows={3}
          placeholder="Moved city, joined elsewhere, financial reasons…"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Stops the fee being chased and takes them out of the conversion numbers. Fees already
        collected stay on the books — a refund is recorded separately.
      </p>
      <Button type="submit" variant="destructive" disabled={pending}>
        {pending ? "Saving…" : "Mark as dropped"}
      </Button>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}
