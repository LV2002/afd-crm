"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useActionState, useTransition } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { moveOnboardingItem, saveOnboardingItem, setOnboardingItemActive, type OnboardingItemState } from "./actions";

const initial: OnboardingItemState = {};

export function ItemRow({ id, label, isActive, first, last }: { id: string; label: string; isActive: boolean; first: boolean; last: boolean }) {
  const [state, action, pending] = useActionState(saveOnboardingItem, initial);
  const [, start] = useTransition();
  return (
    <li className={`flex flex-col gap-1 py-2 ${isActive ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <form action={action} className="flex min-w-0 flex-1 items-center gap-2">
          <input type="hidden" name="id" value={id} />
          <Input name="label" defaultValue={label} aria-label="Item" className="min-w-0 flex-1" />
          <Button type="submit" size="sm" variant="outline" disabled={pending}>Save</Button>
        </form>
        <Button type="button" size="icon" variant="ghost" disabled={first} aria-label="Move up" onClick={() => start(() => void moveOnboardingItem(id, "up"))}>
          <ArrowUp className="size-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" disabled={last} aria-label="Move down" onClick={() => start(() => void moveOnboardingItem(id, "down"))}>
          <ArrowDown className="size-4" />
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => start(() => void setOnboardingItemActive(id, !isActive))}>
          {isActive ? "Switch off" : "Switch on"}
        </Button>
      </div>
      <FormMessage error={state.error} success={state.success} />
    </li>
  );
}

export function AddItemForm() {
  const [state, action, pending] = useActionState(saveOnboardingItem, initial);
  return (
    <form action={action} className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex gap-2">
        <Input name="label" placeholder="e.g. Hostel / travel details noted" aria-label="New item" />
        <Button type="submit" disabled={pending}>Add item</Button>
      </div>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}
