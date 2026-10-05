"use client";

import { Send } from "lucide-react";
import { useActionState } from "react";

import { ConfirmSubmit } from "@/components/ui/confirm-submit";

import { runFrequentNow, type HealthState } from "./actions";

const initialState: HealthState = {};

/**
 * Drains the queue now: automations, scheduled broadcasts, SLA sweep.
 *
 * Distinct from the nightly button because it is the one somebody will
 * actually press, and often — a broadcast sits as `sending` until a sweep
 * picks it up, so on a once-a-day schedule this button is the difference
 * between "sent" and "sent tomorrow morning".
 *
 * It still confirms. Nothing here talks to Meta's ad platform, but it
 * does send real WhatsApp messages to real people.
 */
export function RunFrequentButton() {
  const [state, formAction, pending] = useActionState<HealthState, FormData>(
    async () => runFrequentNow(),
    initialState,
  );

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction}>
        <ConfirmSubmit
          label="Send anything that is waiting"
          icon={<Send className="size-4" />}
          size="sm"
          variant="default"
          pending={pending}
          pendingLabel="Sending…"
          title="Send the queued messages now?"
          body={
            <>
              Any automation step that has come due and any broadcast waiting to go out will be
              sent to real people on WhatsApp. Leads past their response-time target will be
              flagged. Nothing here touches Meta or Google advertising.
            </>
          }
          confirmLabel="Send them now"
        />
      </form>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-success">{state.success}</p>}
    </div>
  );
}
