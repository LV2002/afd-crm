"use client";

import { RotateCcw } from "lucide-react";
import { useActionState, useState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { resetWhatsAppIntegration, type WhatsAppFormState } from "./actions";

const initial: WhatsAppFormState = {};

/**
 * Start the whole WhatsApp integration over.
 *
 * Closed by default and guarded by typing a word: it removes the saved
 * credentials, unregisters every number and hides every message. Leads and
 * the opt-out list are untouched, and nothing inside Meta changes — that
 * side is reset in Meta's own dashboard.
 */
export function ResetIntegrationPanel() {
  const [state, action, pending] = useActionState(resetWhatsAppIntegration, initial);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-4">
        <p className="text-sm text-muted-foreground">
          Reset the whole WhatsApp integration: removes the saved credentials, unregisters every number
          and hides every message, so setup can begin again from a blank screen.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <RotateCcw className="size-4" />
          Reset WhatsApp integration
        </Button>
        {state.success && <p className="w-full text-sm text-green-700 dark:text-green-400">{state.success}</p>}
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-destructive/40 p-4">
      <p className="text-sm font-medium">Reset the WhatsApp integration?</p>
      <ul className="list-disc pl-5 text-sm text-muted-foreground">
        <li>
          <strong>Removed:</strong> the App Secret, Verify Token, Access Token, Phone Number ID, account ID, App ID and
          signup configuration ID saved here.
        </li>
        <li>
          <strong>Unregistered:</strong> every WhatsApp number. <strong>Hidden:</strong> every WhatsApp message
          (an administrator can restore numbers and messages).
        </li>
        <li>
          <strong>Kept:</strong> your leads, the people who opted out, and the delivery history on the Health page.
        </li>
        <li>
          <strong>Not touched:</strong> anything in Meta — the app, the WhatsApp account and the webhook are reset
          there.
        </li>
      </ul>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reset-confirm">Type RESET to confirm</Label>
        <Input id="reset-confirm" name="confirm" required autoComplete="off" placeholder="RESET" />
      </div>
      {state.error && <FormMessage error={state.error} />}
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" size="sm" disabled={pending}>
          {pending ? "Resetting…" : "Reset WhatsApp integration"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
