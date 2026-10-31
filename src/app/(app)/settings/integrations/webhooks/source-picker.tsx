"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface SourceChoice {
  value: string;
  label: string;
}

const NEW = "__new__";

/**
 * Which Lead source this endpoint stamps on its leads.
 *
 * Chosen from the Lead source dropdown itself, so an endpoint is linked to
 * an option that already exists — "Shiksha" — rather than a name somebody
 * types that may or may not match it. A brand-new source is still possible,
 * as a second step.
 */
export function SourcePicker({
  idPrefix,
  options,
  currentValue,
}: {
  idPrefix: string;
  options: SourceChoice[];
  /** The endpoint's stored source, when editing. */
  currentValue?: string;
}) {
  const known = currentValue ? options.some((o) => o.value === currentValue) : false;
  const [choice, setChoice] = useState<string>(
    currentValue ? (known ? currentValue : NEW) : options[0]?.value ?? NEW,
  );

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${idPrefix}-source-choice`}>Lead source</Label>
      <select
        id={`${idPrefix}-source-choice`}
        name="sourceOption"
        value={choice}
        onChange={(event) => setChoice(event.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-base shadow-sm sm:text-[0.9375rem]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        <option value={NEW}>A new source…</option>
      </select>
      {choice === NEW && (
        <Input
          name="newSource"
          required
          defaultValue={currentValue && !known ? currentValue : ""}
          placeholder="Name of the new source"
          aria-label="Name of the new source"
        />
      )}
      <p className="text-xs text-muted-foreground">
        Stamped on every lead from this endpoint. Pick an existing source so its filter and
        reports count these leads; a new name is added to the Lead source dropdown.
      </p>
    </div>
  );
}
