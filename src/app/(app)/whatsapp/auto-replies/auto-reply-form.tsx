"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { saveAutoReply, type AutoReplyState } from "./actions";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function AutoReplyForm({
  kind,
  title,
  help,
  enabled,
  message,
  days,
  opensAt,
  closesAt,
}: {
  kind: "greeting" | "away";
  title: string;
  help: string;
  enabled: boolean;
  message: string;
  days: number[];
  opensAt: string;
  closesAt: string;
}) {
  const [state, action, pending] = useActionState(saveAutoReply, {} as AutoReplyState);
  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border p-4">
      <input type="hidden" name="kind" value={kind} />
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{help}</p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={enabled} /> Switched on
      </label>
      <Textarea name="message" defaultValue={message} rows={3} maxLength={1024} aria-label="Message" />
      {kind === "away" && (
        <div className="flex flex-col gap-2 text-sm">
          <span className="text-muted-foreground">Open on</span>
          <div className="flex flex-wrap gap-3">
            {DAYS.map((label, i) => (
              <label key={label} className="flex items-center gap-1">
                <input type="checkbox" name="days" value={i} defaultChecked={days.includes(i)} /> {label}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input name="opensAt" type="time" defaultValue={opensAt} className="h-9 w-32" aria-label="Opens at" />
            <span>to</span>
            <Input name="closesAt" type="time" defaultValue={closesAt} className="h-9 w-32" aria-label="Closes at" />
            <span className="text-xs text-muted-foreground">India time</span>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>Save</Button>
        <FormMessage error={state.error} success={state.success} />
      </div>
    </form>
  );
}
