"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { saveChatRules, type AutoReplyState } from "./actions";

export function ChatRulesForm({
  alertEnabled,
  alertMinutes,
  escalateMinutes,
  autoAssignUnowned,
  aiSuggestEnabled,
  aiConfigured,
}: {
  alertEnabled: boolean;
  alertMinutes: number;
  escalateMinutes: number;
  autoAssignUnowned: boolean;
  aiSuggestEnabled: boolean;
  aiConfigured: boolean;
}) {
  const [state, action, pending] = useActionState(saveChatRules, {} as AutoReplyState);
  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <h3 className="font-semibold">Chat reply rules</h3>
        <p className="text-sm text-muted-foreground">
          Tell the counsellor when a student&rsquo;s message has waited too long, then the centre head if it is still unanswered.
          Only counted while the office is open (the hours set above).
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="alertEnabled" defaultChecked={alertEnabled} /> Send reminders
      </label>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>Remind the counsellor after</span>
        <Input name="alertMinutes" type="number" min={1} max={1440} defaultValue={alertMinutes} className="h-9 w-24" />
        <span>minutes, and the centre head after</span>
        <Input name="escalateMinutes" type="number" min={1} max={4320} defaultValue={escalateMinutes} className="h-9 w-24" />
        <span>minutes.</span>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="autoAssignUnowned" defaultChecked={autoAssignUnowned} />
        Give a waiting chat on a lead nobody owns to the assignment rules
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="aiSuggestEnabled" defaultChecked={aiSuggestEnabled} />
        Let staff ask the AI to draft a reply
      </label>
      <p className="-mt-2 pl-6 text-xs text-muted-foreground">
        Adds a Suggest button next to Send. It sends that conversation&rsquo;s recent messages (not the phone number) to Google&rsquo;s Gemini service;
        a person always reads and sends the reply.{aiConfigured ? "" : " Needs GEMINI_API_KEY to be set before it works."}
      </p>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>Save</Button>
        <FormMessage error={state.error} success={state.success} />
      </div>
    </form>
  );
}
