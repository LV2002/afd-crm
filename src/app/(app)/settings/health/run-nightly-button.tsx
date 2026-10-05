"use client";

import { Play } from "lucide-react";
import { useActionState } from "react";

import { ConfirmSubmit } from "@/components/ui/confirm-submit";

import { runNightlyNow, type HealthState } from "./actions";

const initialState: HealthState = {};

/**
 * Runs tonight's jobs now.
 *
 * It asks first, because this is not a dry run: queued broadcasts go out,
 * fee reminders are sent, audiences are updated. The dialog says that in
 * those words rather than asking whether somebody is sure.
 *
 * It can take the best part of a minute, so the pending label says what it
 * is waiting on instead of a bare spinner.
 */
export function RunNightlyButton() {
  const [state, formAction, pending] = useActionState<HealthState, FormData>(
    async () => runNightlyNow(),
    initialState,
  );

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction}>
        <ConfirmSubmit
          label="Run tonight's jobs now"
          icon={<Play className="size-4" />}
          size="sm"
          variant="default"
          pending={pending}
          pendingLabel="Running — this takes up to a minute…"
          title="Run the nightly jobs now?"
          body={
            <>
              This is the real run, not a rehearsal. Broadcasts that are queued will be sent, fee
              reminders will go out, and the ad spend and retargeting syncs will talk to Meta and
              Google. It is the same work that happens at 10:00 every morning, brought forward.
            </>
          }
          confirmLabel="Run them now"
        />
      </form>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-success">{state.success}</p>}
    </div>
  );
}
