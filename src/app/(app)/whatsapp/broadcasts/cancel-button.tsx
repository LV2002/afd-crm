"use client";

import { Ban } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { cancelBroadcast, type BroadcastFormState } from "./actions";

const initialState: BroadcastFormState = {};

/**
 * Stops a broadcast that hasn't finished.
 *
 * The reason scheduling is safe to offer at all: composing on Monday for
 * Tuesday morning only works if Monday evening's "wrong list" can be
 * undone. Offered mid-send too, because the alternative when somebody
 * spots the mistake at message 40 of 400 is watching the other 360 leave.
 */
export function CancelBroadcastButton({
  broadcastId,
  scheduled,
}: {
  broadcastId: string;
  scheduled: boolean;
}) {
  const [state, action, pending] = useActionState(cancelBroadcast, initialState);

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="broadcastId" value={broadcastId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        <Ban className="size-4" />
        {pending ? "Stopping…" : scheduled ? "Cancel" : "Stop sending"}
      </Button>
      {state.error && <span className="text-xs text-destructive">{state.error}</span>}
    </form>
  );
}
