"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { KIND_HELP, KIND_LABELS, TEMPERATURE_KINDS } from "@/lib/leads/temperature-kinds";

import { deleteOption, moveOption, setOptionActive, updateOption, type OptionFormState } from "./actions";
import type { OptionRowData } from "./option-row-data";

/**
 * The one category with a per-option meaning attached.
 *
 * A temperature is a lead's whole status, so each one says what the system
 * does with a lead that has it (its kind), how likely it is to end in an
 * admission (for the forecast), whether closing a lead this way must say
 * why, and whether it counts toward the dashboard's Interested figure.
 * Shown only for this category, because a "Chance of admission" on Lost
 * reason or Lead source would be a control that does nothing.
 */
const MEANING_CATEGORY = "temperature";

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
  const [kind, setKind] = useState(option.kind);
  // Surfaced, not swallowed: deleting is refused for a temperature that
  // leads are still on, and the reason has to reach the person who pressed it.
  const [actionError, setActionError] = useState<string | null>(null);

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      setActionError(null);
      const result = await fn();
      if (result && typeof result === "object" && "error" in result && typeof result.error === "string") {
        setActionError(result.error);
      }
      router.refresh();
    });
  }

  const isMeaningCategory = category === MEANING_CATEGORY;

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
      {/* For a temperature the value is its identity — leads store it and the
          status rules look the kind up by it — so it is shown but not
          editable. The label is what people read, and that stays free. */}
      <Input
        name="value"
        defaultValue={option.value}
        className="w-36"
        required
        readOnly={isMeaningCategory}
        aria-readonly={isMeaningCategory}
        title={isMeaningCategory ? "The value is how leads remember this temperature, so it can't be renamed. Change the label instead." : undefined}
      />
      <Input name="label" defaultValue={option.label} className="w-40 flex-1" required />
      {isMeaningCategory && (
        <div className="flex w-full flex-wrap items-end gap-3 border-t pt-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            What it means
            <select
              name="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as typeof kind)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            >
              {TEMPERATURE_KINDS.map((value) => (
                <option key={value} value={value}>
                  {KIND_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Chance of admission %
            <Input
              name="probability"
              type="number"
              min={0}
              max={100}
              step="any"
              defaultValue={option.probability}
              className="w-28"
              placeholder="not set"
            />
          </label>
          {kind === "lost" && (
            <label className="flex items-center gap-1.5 whitespace-nowrap text-xs">
              <input
                type="checkbox"
                name="requiresReason"
                defaultChecked={option.requiresReason}
                className="size-4 rounded border-input"
              />
              Ask why when this is chosen
            </label>
          )}
          <label className="flex items-center gap-1.5 whitespace-nowrap text-xs">
            {/* A plain checkbox inside the form, not the Switch beside it:
                this one is saved with Save like the label, where the Switch
                writes immediately. Two controls that look alike and commit
                differently is how somebody loses an edit. */}
            <input
              type="checkbox"
              name="interested"
              defaultChecked={option.interested}
              className="size-4 rounded border-input"
            />
            Counts as interested
          </label>
          <p className="w-full text-xs text-muted-foreground">{KIND_HELP[kind]}</p>
        </div>
      )}
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
      {actionError ? <p className="w-full text-xs text-destructive">{actionError}</p> : null}
    </form>
  );
}
