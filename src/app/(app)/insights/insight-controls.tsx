"use client";

import { RotateCcw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FieldOption } from "@/lib/fields/resolve-field-options";
import { filterParamKey } from "@/lib/leads/apply-filters";
import { NOT_SET, NOT_SET_LABEL, type PivotField } from "@/lib/reports/pivot";

/** shadcn's Select can't hold an empty-string item, so "no filter" needs a token of its own. */
const ANY = "__any__";

export interface DimensionControl {
  field: PivotField;
  options: FieldOption[];
}

/**
 * The whole of Insights' query, as URL search params.
 *
 * Nothing is computed here — every control just rewrites the URL and lets
 * the server component re-run the pivot. That keeps one source of truth
 * for what a chart is showing (the address bar), makes any view
 * shareable by copying the link, and means the back button works the way
 * it should. Same approach as the leads list's filter bar.
 */
export function InsightControls({
  dimensions,
  groupBy,
  from,
  to,
  activeCount,
}: {
  dimensions: DimensionControl[];
  groupBy: string;
  from: string;
  to: string;
  activeCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function updateParams(changes: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value && value !== ANY) params.set(key, value);
      else params.delete(key);
    }
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  // Free text commits on Enter or blur, not per keystroke — a navigation
  // per character would re-run the whole pivot.
  function commitOnEnter(key: string) {
    return (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") updateParams({ [key]: event.currentTarget.value });
    };
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4" aria-busy={isPending}>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Break down by</Label>
          <Select value={groupBy} onValueChange={(value) => updateParams({ group: value })}>
            <SelectTrigger className="h-9 w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dimensions.map(({ field }) => (
                <SelectItem key={field.key} value={field.key}>
                  {field.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground" htmlFor="insights-from">
            Created from
          </Label>
          <Input
            id="insights-from"
            type="date"
            className="h-9 w-40"
            defaultValue={from}
            onChange={(event) => updateParams({ from: event.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground" htmlFor="insights-to">
            to
          </Label>
          <Input
            id="insights-to"
            type="date"
            className="h-9 w-40"
            defaultValue={to}
            onChange={(event) => updateParams({ to: event.target.value })}
          />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => startTransition(() => router.push(pathname))}
        >
          <RotateCcw className="size-3" /> Reset
        </Button>
      </div>

      {/*
        Every variable gets a filter, which is a lot of controls — folded
        away by default, and open already when something is filtered so a
        narrowed view never looks like an empty database.
      */}
      <details open={activeCount > 0} className="group">
        <summary className="cursor-pointer text-sm font-medium">
          Filters{activeCount > 0 ? ` — ${activeCount} active` : ""}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            every variable, ANDed together
          </span>
        </summary>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {dimensions.map(({ field, options }) => {
            const key = filterParamKey(field);
            const current = searchParams.get(key) ?? "";
            return (
              <div key={field.key} className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">{field.label}</Label>
                {options.length > 0 ? (
                  <Select
                    value={current || ANY}
                    onValueChange={(value) => updateParams({ [key]: value })}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>Any</SelectItem>
                      <SelectItem value={NOT_SET}>{NOT_SET_LABEL}</SelectItem>
                      {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={field.type === "date" || field.type === "datetime" ? "month" : "text"}
                    className="h-8"
                    placeholder={
                      field.type === "date" || field.type === "datetime" ? "" : "contains…"
                    }
                    defaultValue={current}
                    onKeyDown={commitOnEnter(key)}
                    onBlur={(event) => updateParams({ [key]: event.target.value })}
                  />
                )}
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}
