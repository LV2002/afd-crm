"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";

import { markProfileFormRead, type ReviewState } from "./actions";

const initial: ReviewState = {};

/**
 * One click to take a form off the queue.
 *
 * No confirmation: the worst case of an accidental click is that a red
 * number goes down, and the form itself is still there to read. A dialog
 * guarding that would cost more than it saves on a list somebody works
 * through several at a time.
 */
export function MarkReadButton({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionState(markProfileFormRead, initial);

  return (
    <form action={action} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="leadId" value={leadId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        <Check className="size-4" />
        {pending ? "Saving…" : "Mark read"}
      </Button>
      {state.error && <FormMessage error={state.error} />}
    </form>
  );
}
