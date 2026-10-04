"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { updateRetargetingSettings, type RetargetingSettingsState } from "./actions";

const initialState: RetargetingSettingsState = {};

export function RetargetingForm({ windowDays }: { windowDays: number }) {
  const [state, formAction, pending] = useActionState(updateRetargetingSettings, initialState);

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="retargetingWindowDays">Keep leads in the audience for</Label>
        <div className="flex items-center gap-2">
          <Input
            id="retargetingWindowDays"
            name="retargetingWindowDays"
            type="number"
            min={0}
            max={3650}
            step={1}
            defaultValue={windowDays}
            className="w-28"
          />
          <span className="text-sm text-muted-foreground">days</span>
        </div>
        <p className="text-xs text-muted-foreground">
          180 days is six months. Counted from the later of when the lead arrived and the last
          thing that happened on it, so somebody still being followed up stays in. Use 0 to keep
          every consenting lead for ever.
        </p>
      </div>

      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
