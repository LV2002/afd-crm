"use client";

import { RefreshCw } from "lucide-react";
import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";

import { startNewPeopleNow, type FlowFormState } from "../actions";

/**
 * What a "when somebody is added to a database" automation is doing: which
 * lists it watches, who it has started, who is waiting for the next check, and
 * when the scheduled check last ran — the thing that decides how soon a new
 * person gets their first message.
 */
export function AutoStartPanel({
  flowId,
  isActive,
  lists,
  watchingSince,
  started,
  lastStartedAt,
  waiting,
  lastCheckAt,
}: {
  flowId: string;
  isActive: boolean;
  lists: string[];
  watchingSince: string | null;
  started: number;
  lastStartedAt: string | null;
  waiting: number;
  /** When the ten-minute check last ran, or null when it never has. */
  lastCheckAt: string | null;
}) {
  const [state, action, pending] = useActionState(startNewPeopleNow, {} as FlowFormState);
  return (
    <div className="flex max-w-2xl flex-col gap-2 rounded-lg border p-4 text-sm">
      <h3 className="font-semibold">Starts by itself when somebody is added</h3>
      <p>
        Watching: <strong>{lists.length > 0 ? lists.join(", ") : "no list chosen"}</strong>
        {watchingSince ? <span className="text-muted-foreground"> · people added since {watchingSince}</span> : null}
      </p>
      <p>
        {isActive ? "It is on." : <strong className="text-amber-700">It is off — nothing starts until you switch it on.</strong>} Started so far:{" "}
        <strong>{started}</strong>
        {lastStartedAt ? <span className="text-muted-foreground"> · last one {lastStartedAt}</span> : null}. Waiting for the next check: <strong>{waiting}</strong>.
      </p>
      <p className="text-xs text-muted-foreground">
        {lastCheckAt
          ? `The scheduled check last ran ${lastCheckAt}. It runs every 10 minutes; people added through your webhook start at once.`
          : "The scheduled check has not run yet. New people are only started when it runs (set up under Settings → Health), or when you press the button."}
      </p>
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="flowId" value={flowId} />
        <Button type="submit" size="sm" variant="outline" disabled={pending || !isActive}>
          <RefreshCw className="size-4" />
          {pending ? "Checking…" : "Check for new people now"}
        </Button>
        <FormMessage error={state.error} success={state.success} />
      </form>
    </div>
  );
}
