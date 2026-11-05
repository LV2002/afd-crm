"use client";

import { Send } from "lucide-react";
import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";

import { startFlowForLists, type FlowFormState } from "../actions";

const initialState: FlowFormState = {};

/**
 * Starts a database automation for whole lists. Only lists marked as having
 * agreed to WhatsApp can be ticked; leads on them are never messaged.
 */
export function StartForLists({
  flowId,
  isActive,
  lists,
}: {
  flowId: string;
  isActive: boolean;
  lists: Array<{ id: string; name: string; agreed: boolean }>;
}) {
  const [state, action, pending] = useActionState(startFlowForLists, initialState);
  const anyAgreed = lists.some((list) => list.agreed);

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-3 rounded-lg border p-4">
      <input type="hidden" name="flowId" value={flowId} />
      <h3 className="text-sm font-semibold">Start it for these lists</h3>
      <p className="text-xs text-muted-foreground">
        Goes only to people on the lists you tick who are <strong>not leads</strong> and have not opted out. Anyone who
        becomes a lead part-way through is dropped from it.
      </p>
      {!anyAgreed && (
        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
          Nothing to start yet. Go to Database → Lists, make a list, and tick &ldquo;agreed to WhatsApp&rdquo; on it.
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        {lists.map((list) => (
          <label key={list.id} className={`flex items-center gap-2 text-sm ${list.agreed ? "" : "opacity-60"}`}>
            <input type="checkbox" name="listIds" value={list.id} disabled={!list.agreed} />
            {list.name}
            {!list.agreed && <span className="text-xs text-muted-foreground">— not marked as agreed to WhatsApp</span>}
          </label>
        ))}
      </div>
      {!isActive && <p className="text-xs text-muted-foreground">Switch the automation on first.</p>}
      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" size="sm" disabled={pending || !isActive || !anyAgreed} className="w-fit">
        <Send className="size-4" />
        {pending ? "Starting…" : "Start"}
      </Button>
    </form>
  );
}
