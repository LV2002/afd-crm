"use client";

import { Undo2 } from "lucide-react";
import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";

import { restoreLead, type FormState } from "../[id]/actions";

const initial: FormState = {};

export function RestoreButton({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionState(restoreLead, initial);

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="leadId" value={leadId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        <Undo2 className="size-4" />
        {pending ? "Restoring…" : "Restore"}
      </Button>
      {state.error && <FormMessage error={state.error} />}
    </form>
  );
}
