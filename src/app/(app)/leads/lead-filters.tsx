"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
}: {
  filterFields: FilterFieldWithOptions[];
  searchValue: string;
  tagOptions?: FieldOption[];
  tagValue?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page"); // any filter change resets pagination
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
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
          <Select
            key={field.id}
            value={current || undefined}
            onValueChange={(value) => updateParam(key, value)}
          >
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder={field.label} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      })}
      {tagOptions && tagOptions.length > 0 && (
        <Select value={tagValue || undefined} onValueChange={(value) => updateParam("tag", value)}>
          <SelectTrigger className="h-8 w-40">
            <SelectValue placeholder="Tag" />
          </SelectTrigger>
          <SelectContent>
            {tagOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
