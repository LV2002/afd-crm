"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { markResolved, type HealthState } from "./actions";

const initialState: HealthState = {};

export function ResolveButton({ errorId }: { errorId: string }) {
  const [state, action, pending] = useActionState(markResolved, initialState);

  return (
    <form action={action}>
      <input type="hidden" name="errorId" value={errorId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        <Check className="size-4" />
        {pending ? "Saving…" : "Mark fixed"}
      </Button>
      {state.error && <p className="mt-1 text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
