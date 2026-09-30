"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";

export interface StudentFilterOption {
  value: string;
  label: string;
}

export interface StudentFilterValues {
  search: string;
  centerId: string;
  course: string;
  batchId: string;
  status: string;
  joinedFrom: string;
  joinedTo: string;
}

/**
 * Every column on the students list, filterable.
 *
 * It had a search box and a status dropdown, which meant "show me the Kochi
 * Foundation students who joined in July" was a question nobody could ask —
 * and that is the question academics actually has, every time a batch
 * starts.
 *
 * Purely a URL search-params editor, the same shape as the leads filter bar:
 * the server component that renders the list is the single source of truth
 * for what is actually filtered. That keeps the filters shareable as a link
 * and survivable across a refresh, which a client-state filter bar is not.
 */
export function StudentFilters({
  values,
  centres,
  courses,
  batches,
  statuses,
}: {
  values: StudentFilterValues;
  centres: StudentFilterOption[];
  courses: StudentFilterOption[];
  batches: StudentFilterOption[];
  statuses: StudentFilterOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  // Text and date inputs commit on Enter or blur, never per keystroke: a
  // navigation per character would thrash both the router and the query.
  function commitOnEnter(key: string) {
    return (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") updateParam(key, event.currentTarget.value);
    };
  }

  const anyActive = Object.values(values).some((value) => value !== "");

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={isPending}>
      <Input
        type="search"
        placeholder="Name, phone or code… (Enter)"
        defaultValue={values.search}
        className="h-8 w-56"
        aria-label="Search students"
        onKeyDown={commitOnEnter("search")}
        onBlur={(event) => {
          if (event.currentTarget.value !== values.search) {
            updateParam("search", event.currentTarget.value);
          }
        }}
      />

      <Combobox
        size="sm"
        className="w-40"
        options={centres}
        value={values.centerId}
        onChange={(next) => updateParam("center", next)}
        placeholder="Centre"
        clearable
      />

      <Combobox
        size="sm"
        className="w-44"
        options={courses}
        value={values.course}
        onChange={(next) => updateParam("course", next)}
        placeholder="Course"
        clearable
      />

      <Combobox
        size="sm"
        className="w-48"
        options={batches}
        value={values.batchId}
        onChange={(next) => updateParam("batch", next)}
        placeholder="Batch"
        clearable
      />

      <Combobox
        size="sm"
        className="w-36"
        options={statuses}
        value={values.status}
        onChange={(next) => updateParam("status", next)}
        placeholder="Status"
        clearable
      />

      <div className="flex items-center gap-1">
        <label htmlFor="joined-from" className="text-xs text-muted-foreground">
          Joined
        </label>
        <Input
          id="joined-from"
          type="date"
          defaultValue={values.joinedFrom}
          className="h-8 w-36"
          aria-label="Joined on or after"
          onKeyDown={commitOnEnter("from")}
          onBlur={(event) => {
            if (event.currentTarget.value !== values.joinedFrom) {
              updateParam("from", event.currentTarget.value);
            }
          }}
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          type="date"
          defaultValue={values.joinedTo}
          className="h-8 w-36"
          aria-label="Joined on or before"
          onKeyDown={commitOnEnter("to")}
          onBlur={(event) => {
            if (event.currentTarget.value !== values.joinedTo) {
              updateParam("to", event.currentTarget.value);
            }
          }}
        />
      </div>

      {anyActive ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => startTransition(() => router.push(pathname))}
        >
          Clear
        </Button>
      ) : null}
    </div>
  );
}
