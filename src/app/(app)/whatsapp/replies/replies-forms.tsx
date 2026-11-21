"use client";

import { useActionState, useTransition } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { chipClass } from "@/components/whatsapp/label-colours";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { deleteLabel, deleteSavedReply, saveLabel, saveSavedReply, type InboxToolState } from "../inbox-actions";

const initial: InboxToolState = {};
const select = "h-9 rounded-md border bg-background px-2 text-sm";

export function ReplyForm({ reply }: { reply?: { id: string; title: string; shortcut: string | null; body: string } }) {
  const [state, action, pending] = useActionState(saveSavedReply, initial);
  const [, start] = useTransition();
  return (
    <form action={action} className="flex flex-col gap-2 rounded-lg border p-3">
      {reply && <input type="hidden" name="id" value={reply.id} />}
      <div className="flex flex-wrap gap-2">
        <Input name="title" defaultValue={reply?.title} placeholder="Title, e.g. Fee structure" aria-label="Title" className="w-56" />
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground">/</span>
          <Input name="shortcut" defaultValue={reply?.shortcut ?? ""} placeholder="shortcut" aria-label="Shortcut" className="w-32" />
        </div>
      </div>
      <Textarea name="body" defaultValue={reply?.body} rows={3} placeholder="The message. Use {{name}} for their first name." aria-label="Message" />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>{reply ? "Save" : "Add reply"}</Button>
        {reply && (
          <Button type="button" size="sm" variant="ghost" onClick={() => start(() => void deleteSavedReply(reply.id))}>Delete</Button>
        )}
        <FormMessage error={state.error} success={state.success} />
      </div>
    </form>
  );
}

export function LabelForm({ label }: { label?: { id: string; name: string; colour: string } }) {
  const [state, action, pending] = useActionState(saveLabel, initial);
  const [, start] = useTransition();
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {label && <input type="hidden" name="id" value={label.id} />}
      <Input name="name" defaultValue={label?.name} placeholder="Label name" aria-label="Label name" className="w-44" />
      <select name="colour" defaultValue={label?.colour ?? "slate"} className={select} aria-label="Colour">
        {["slate", "green", "amber", "blue", "violet", "red"].map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      {label && <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", chipClass(label.colour))}>{label.name}</span>}
      <Button type="submit" size="sm" variant="outline" disabled={pending}>{label ? "Save" : "Add label"}</Button>
      {label && <Button type="button" size="sm" variant="ghost" onClick={() => start(() => void deleteLabel(label.id))}>Delete</Button>}
      <FormMessage error={state.error} />
    </form>
  );
}
