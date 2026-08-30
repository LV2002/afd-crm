"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/layout/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { createBroadcast, type BroadcastFormState } from "../actions";

const initialState: BroadcastFormState = {};

export function NewBroadcastForm({ tags }: { tags: Array<{ id: string; name: string }> }) {
  const [state, formAction, pending] = useActionState(createBroadcast, initialState);

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" placeholder="e.g. NID 2027 Foundation follow-up" required />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="tagId">Target tag</Label>
        <Select name="tagId">
          <SelectTrigger id="tagId">
            <SelectValue placeholder="Choose a tag" />
          </SelectTrigger>
          <SelectContent>
            {tags.map((tag) => (
              <SelectItem key={tag.id} value={tag.id}>
                {tag.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Every non-do-not-contact lead currently carrying this tag becomes a recipient.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="templateName">Template name</Label>
        <Input id="templateName" name="templateName" placeholder="Approved in WhatsApp Manager" required />
      </div>

      <div className="flex gap-4">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="templateLanguage">Language code</Label>
          <Input id="templateLanguage" name="templateLanguage" defaultValue="en_US" />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="bodyParam">{"{{1}}"} value (optional)</Label>
          <Input id="bodyParam" name="bodyParam" placeholder="Same value for every recipient" />
        </div>
      </div>

      <FormMessage error={state.error} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Queuing…" : "Queue broadcast"}
      </Button>
    </form>
  );
}
