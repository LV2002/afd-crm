"use client";

import { Power, PowerOff, Square, Trash2 } from "lucide-react";
import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";

import { deleteFlow, setFlowActive, stopAllRuns, type FlowFormState } from "../actions";

const initialState: FlowFormState = {};

/**
 * On, off, stop everybody, remove.
 *
 * "Off" and "stop everybody" are separate buttons because they are
 * different decisions. Switching off stops NEW people entering;
 * somebody already mid-conversation, who has just been asked a question,
 * should get the answer to it. Ending their run is the deliberate act.
 */
export function FlowControls({
  flowId,
  isActive,
  liveRuns,
}: {
  flowId: string;
  isActive: boolean;
  liveRuns: number;
}) {
  const [activeState, activeAction, activePending] = useActionState(setFlowActive, initialState);
  const [stopState, stopAction, stopPending] = useActionState(stopAllRuns, initialState);
  const [removeState, removeAction] = useActionState(deleteFlow, initialState);

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <form action={activeAction}>
          <input type="hidden" name="flowId" value={flowId} />
          <input type="hidden" name="active" value={String(!isActive)} />
          <Button
            type="submit"
            size="sm"
            variant={isActive ? "outline" : "default"}
            disabled={activePending}
          >
            {isActive ? <PowerOff className="size-4" /> : <Power className="size-4" />}
            {activePending ? "…" : isActive ? "Switch off" : "Switch on"}
          </Button>
        </form>

        {liveRuns > 0 && (
          <form action={stopAction}>
            <input type="hidden" name="flowId" value={flowId} />
            <Button type="submit" size="sm" variant="outline" disabled={stopPending}>
              <Square className="size-4" />
              {stopPending ? "Stopping…" : `Stop all ${liveRuns}`}
            </Button>
          </form>
        )}

        <form action={removeAction}>
          <input type="hidden" name="flowId" value={flowId} />
          <Button type="submit" size="sm" variant="ghost">
            <Trash2 className="size-4" /> Remove
          </Button>
        </form>
      </div>

      <FormMessage
        error={activeState.error ?? stopState.error ?? removeState.error}
        success={activeState.success ?? stopState.success ?? removeState.success}
      />

      {!isActive && (
        <p className="text-xs text-muted-foreground">
          Nothing is sent while it is off. It has to pass a check before it can be switched on — a
          branch pointing at a step that does not exist would silently end everybody&rsquo;s run.
        </p>
      )}
    </div>
  );
}
