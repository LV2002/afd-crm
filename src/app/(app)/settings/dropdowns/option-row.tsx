"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import { deleteOption, moveOption, setOptionActive, updateOption, type OptionFormState } from "./actions";

export interface OptionRowData {
  id: string;
  value: string;
  label: string;
  color: string | null;
  is_active: boolean;
}

const initialState: OptionFormState = {};

export function OptionRow({
  category,
  option,
  isFirst,
  isLast,
}: {
  category: string;
  option: OptionRowData;
  isFirst: boolean;
  isLast: boolean;
}) {
  const action = updateOption.bind(null, option.id, category);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
      <input
        type="color"
        aria-label="Colour"
        defaultValue={option.color ?? "#94a3b8"}
        className="h-9 w-10 shrink-0 rounded border border-input"
        onChange={(e) => {
          const input = document.getElementById(`color-${option.id}`) as HTMLInputElement | null;
          if (input) input.value = e.target.value;
        }}
      />
      <Input id={`color-${option.id}`} name="color" defaultValue={option.color ?? ""} className="w-28" />
      <Input name="value" defaultValue={option.value} className="w-36" required />
      <Input name="label" defaultValue={option.label} className="w-40 flex-1" required />
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon" disabled={isPending || isFirst} onClick={() => run(() => moveOption(option.id, category, "up"))}>
          <ArrowUp className="size-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" disabled={isPending || isLast} onClick={() => run(() => moveOption(option.id, category, "down"))}>
          <ArrowDown className="size-4" />
        </Button>
        <Switch
          checked={option.is_active}
          disabled={isPending}
          onCheckedChange={(checked) => run(() => setOptionActive(option.id, category, checked))}
          aria-label="Active"
        />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={isPending}
          onClick={() => {
            if (!window.confirm(`Delete "${option.label}"?`)) return;
            run(() => deleteOption(option.id, category));
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      {state.error ? <p className="w-full text-xs text-destructive">{state.error}</p> : null}
    </form>
  );
}
