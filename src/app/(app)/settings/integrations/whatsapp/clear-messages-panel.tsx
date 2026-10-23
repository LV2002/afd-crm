"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { clearWhatsAppMessages, type NumberFormState } from "./numbers-actions";

const initial: NumberFormState = {};

/**
 * Start the WhatsApp inbox over.
 *
 * For after a setup that left test chats behind. Closed by default and
 * guarded by typing a word — it hides every message on every number,
 * including those on leads' pages. Hidden, not erased: an administrator
 * can restore them.
 */
export function ClearMessagesPanel({ messageCount }: { messageCount: number }) {
  const [state, action, pending] = useActionState(clearWhatsAppMessages, initial);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-4">
        <p className="text-sm text-muted-foreground">
          Start the inbox over. Hides all {messageCount.toLocaleString("en-IN")} WhatsApp{" "}
          {messageCount === 1 ? "message" : "messages"} — useful after a setup that left test chats behind.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Trash2 className="size-4" />
          Clear all messages
        </Button>
        {state.success && <p className="w-full text-sm text-green-700 dark:text-green-400">{state.success}</p>}
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-destructive/40 p-4">
      <p className="text-sm font-medium">Hide all {messageCount.toLocaleString("en-IN")} WhatsApp messages?</p>
      <p className="text-sm text-muted-foreground">
        They disappear from the inbox and from every lead&apos;s page, on every number. They are hidden,
        not erased — an administrator can restore them. Numbers, credentials and leads are untouched.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm">Type CLEAR to confirm</Label>
        <Input id="confirm" name="confirm" required autoComplete="off" placeholder="CLEAR" />
      </div>
      {state.error && <FormMessage error={state.error} />}
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" size="sm" disabled={pending}>
          {pending ? "Clearing…" : "Clear all messages"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
