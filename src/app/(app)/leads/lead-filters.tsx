"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import type { FieldSchemaEntry } from "@/lib/fields/get-field-schema";
import type { FieldOption } from "@/lib/fields/resolve-field-options";
import { filterParamKey } from "@/lib/leads/apply-filters";

export interface FilterFieldWithOptions {
  field: FieldSchemaEntry;
  options: FieldOption[];
}

/**
 * One control per filterable field, chosen by field type — a dropdown for
 * select/multiselect/user_ref, free text otherwise. Purely a URL search
 * params editor: the server component that renders the list is the one
 * source of truth for what's actually filtered (see apply-filters.ts).
 */
export function LeadFilters({
  filterFields,
  searchValue,
  tagOptions,
  tagValue,
  months,
}: {
  filterFields: FilterFieldWithOptions[];
  searchValue: string;
  tagOptions?: FieldOption[];
  tagValue?: string;
  /** The last twelve months, newest first, computed on the server so the list is IST. */
  months: FieldOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function updateParams(changes: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page"); // any filter change resets pagination
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  function updateParam(key: string, value: string) {
    updateParams({ [key]: value });
  }

  // Text inputs commit on blur/Enter, not per keystroke — a router.push on
  // every character would thrash navigation and the server-side query.
  function commitOnEnter(key: string) {
    return (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") updateParam(key, e.currentTarget.value);
    };
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={isPending}>
      <Input
        placeholder="Search name or phone… (Enter)"
        defaultValue={searchValue}
        className="h-8 w-56"
        onKeyDown={commitOnEnter("search")}
        onBlur={(e) => updateParam("search", e.target.value)}
      />
      {filterFields.map(({ field, options }) => {
        const key = filterParamKey(field);
        const current = searchParams.get(key) ?? "";
        if (options.length === 0) {
          return (
            <Input
              key={field.id}
              placeholder={`${field.label} (Enter)`}
              defaultValue={current}
              className="h-8 w-40"
              onKeyDown={commitOnEnter(key)}
              onBlur={(e) => updateParam(key, e.target.value)}
            />
          );
        }
        return (
          <Combobox
            key={field.id}
            className="w-40"
            size="sm"
            value={current}
            onChange={(value) => updateParam(key, value)}
            options={options}
            placeholder={field.label}
            searchPlaceholder={`Type a ${field.label.toLowerCase()}…`}
            // A filter you cannot take off is a filter that quietly hides
            // half the list until somebody reloads the page.
            clearable
          />
        );
      })}
      {tagOptions && tagOptions.length > 0 && (
        <Combobox
          className="w-40"
          size="sm"
          value={tagValue ?? ""}
          onChange={(value) => updateParam("tag", value)}
          options={tagOptions}
          placeholder="Tag"
          searchPlaceholder="Type a tag…"
          clearable
        />
      )}

      {/*
        The date filters, on their own line with labels, because a bare
        date box beside nine dropdowns says nothing about which date it
        means — and getting "arrived" and "due" the wrong way round is
        the one mistake that makes this screen lie to you.
      */}
      <div className="flex w-full flex-wrap items-center gap-2 border-t pt-2">
        <span className="text-xs font-medium text-muted-foreground">Arrived</span>
        <Combobox
          className="w-40"
          size="sm"
          value={searchParams.get("created_month") ?? ""}
          /* Choosing a month clears the two dates, so the screen never
             shows a month and a range that disagree with each other. */
          onChange={(value) => updateParams({ created_month: value, created_from: "", created_to: "" })}
          options={months}
          placeholder="Any month"
          searchPlaceholder="Type a month…"
          clearable
        />
        <DateInput
          label="from"
          value={searchParams.get("created_from") ?? ""}
          onChange={(value) => updateParams({ created_from: value, created_month: "" })}
        />
        <DateInput
          label="to"
          value={searchParams.get("created_to") ?? ""}
          onChange={(value) => updateParams({ created_to: value, created_month: "" })}
        />

        <span className="ml-2 text-xs font-medium text-muted-foreground">Follow-up</span>
        <Combobox
          className="w-44"
          size="sm"
          value={searchParams.get("followup") ?? ""}
          onChange={(value) => updateParams({ followup: value, followup_from: "", followup_to: "" })}
          options={FOLLOWUP_WINDOWS}
          placeholder="Any time"
          searchPlaceholder="Type…"
          clearable
        />
        <DateInput
          label="from"
          value={searchParams.get("followup_from") ?? ""}
          onChange={(value) => updateParams({ followup_from: value, followup: "" })}
        />
        <DateInput
          label="to"
          value={searchParams.get("followup_to") ?? ""}
          onChange={(value) => updateParams({ followup_to: value, followup: "" })}
        />
      </div>
    </div>
  );
}

/**
 * The named windows people ask for constantly. "Overdue" is the reason
 * this whole row exists: it is how a centre head finds the leads a
 * counsellor has fallen behind on, and it excludes anybody already won
 * or lost — a student who enrolled in March still carries February's
 * follow-up date.
 */
const FOLLOWUP_WINDOWS: FieldOption[] = [
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "week", label: "Due in 7 days" },
  { value: "none", label: "No follow-up booked" },
];

/**
 * A native date picker. `type="date"` gives every platform its own
 * calendar — including the one on a counsellor's phone, which is better
 * than anything worth building here — and commits on change rather than
 * on blur, because a date is chosen in one gesture rather than typed.
 */
function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-xs text-muted-foreground">
      {label}
      <Input
        type="date"
        value={value}
        className="h-8 w-[9.5rem]"
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
