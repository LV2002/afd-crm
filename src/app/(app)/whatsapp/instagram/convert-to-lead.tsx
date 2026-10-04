"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { convertConversationToLead, type InstagramActionState } from "./actions";

const initialState: InstagramActionState = {};

/**
 * The button that makes a conversation an enquiry.
 *
 * A phone number is required and cannot be prefilled: Instagram gives us
 * an account id and sometimes a handle, never a number. Asking for it
 * here is the honest version of "we do not have this" — the alternative
 * would be a lead nobody can ring.
 */
export function ConvertToLead({
  conversationId,
  suggestedName,
}: {
  conversationId: string;
  suggestedName: string;
}) {
  const [state, formAction, pending] = useActionState(convertConversationToLead, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
      <div>
        <p className="text-sm font-medium">Not a lead yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          A DM does not create a lead on its own — most of them are a question or a reply to a
          story. Convert it when this one turns into a real enquiry: it goes through the same
          path as every other source, so somebody already in the CRM is linked rather than
          duplicated, and your assignment rules decide the counsellor.
        </p>
      </div>

      <input type="hidden" name="conversationId" value={conversationId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`name-${conversationId}`}>Name</Label>
          <Input
            id={`name-${conversationId}`}
            name="studentName"
            defaultValue={suggestedName}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`phone-${conversationId}`}>Phone</Label>
          <Input
            id={`phone-${conversationId}`}
            name="primaryPhone"
            placeholder="+91…"
            required
          />
          <p className="text-xs text-muted-foreground">
            Ask them for it — Instagram never gives us a number.
          </p>
        </div>
      </div>

      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Creating…" : "Convert to lead"}
      </Button>
    </form>
  );
}
