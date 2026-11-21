"use client";

import { Send } from "lucide-react";
import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { sendFlowTest, type FlowTestState } from "../actions";

/** "Send me a test": the flow's messages to your own phone, so you can see what people will see. Touches no lead. */
export function TestSend({ flowId }: { flowId: string }) {
  const [state, action, pending] = useActionState(sendFlowTest, {} as FlowTestState);
  return (
    <form action={action} className="flex flex-col gap-2 rounded-lg border p-4">
      <input type="hidden" name="flowId" value={flowId} />
      <p className="text-sm font-medium">Send me a test</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input name="phone" placeholder="Your WhatsApp number, e.g. 98470 12345" className="h-9 w-64" aria-label="Your WhatsApp number" />
        <Button type="submit" size="sm" disabled={pending}>
          <Send className="size-4" /> {pending ? "Sending…" : "Send test"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Sends each message to that number now. Waits, questions&rsquo; answers and changes to a lead are skipped.
        For typed messages to arrive, first send any message to the institute&rsquo;s WhatsApp from that phone.
      </p>
      <FormMessage error={state.error} success={state.success} />
      {state.report && (
        <ul className="list-inside list-disc text-xs text-muted-foreground">
          {state.report.map((line, i) => <li key={i}>{line}</li>)}
        </ul>
      )}
    </form>
  );
}
