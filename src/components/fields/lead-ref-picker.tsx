"use client";

import { Search, X } from "lucide-react";
import * as React from "react";

import { Input } from "@/components/ui/input";
import { searchLeads, type LeadSearchResult } from "@/lib/leads/search-leads";
import { cn } from "@/lib/utils";

/**
 * Pointing one lead at another — "who referred them?".
 *
 * The `lead_ref` field type has existed in the schema since the first
 * week and rendered a disabled box, because a dropdown of every lead is
 * not a control anybody can use once there are more than a few hundred.
 * This searches instead: type two characters of a name or a number and
 * pick from what comes back.
 *
 * ## What it posts
 *
 * A hidden input carrying the chosen lead's id, so it submits inside
 * `<form action={serverAction}>` like every other field here. The visible
 * box is a search field and never a value — clearing the search does not
 * clear the choice, which is what you want when somebody types to check
 * they picked the right person.
 *
 * ## Numbers stay masked
 *
 * The results show `+91 98••••3456`, enough to tell two Anjalis apart and
 * no more (CLAUDE.md § 6). Revealing a number stays a deliberate, audited
 * act on the lead's own page.
 */
export function LeadRefPicker({
  name,
  id,
  defaultValue = "",
  defaultLabel,
  excludeId,
  placeholder = "Search by name or number…",
}: {
  name: string;
  id?: string;
  defaultValue?: string;
  /** Shown when the form loads with a lead already chosen. */
  defaultLabel?: LeadSearchResult | null;
  /** The lead being edited — nobody refers themselves. */
  excludeId?: string;
  placeholder?: string;
}) {
  const [chosen, setChosen] = React.useState<LeadSearchResult | null>(defaultLabel ?? null);
  const [value, setValue] = React.useState(defaultValue);
  const [term, setTerm] = React.useState("");
  const [results, setResults] = React.useState<LeadSearchResult[]>([]);
  const [open, setOpen] = React.useState(false);
  const [searching, setSearching] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (term.trim().length < 2) {
      setResults([]);
      return;
    }
    // Debounced: a query per keystroke would be a query per keystroke.
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      const found = await searchLeads(term);
      if (cancelled) return;
      setResults(found.filter((row) => row.id !== excludeId));
      setSearching(false);
      setOpen(true);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setSearching(false);
    };
  }, [term, excludeId]);

  React.useEffect(() => {
    function onOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  function choose(row: LeadSearchResult) {
    setChosen(row);
    setValue(row.id);
    setTerm("");
    setResults([]);
    setOpen(false);
  }

  function clear() {
    setChosen(null);
    setValue("");
    setTerm("");
  }

  return (
    <div ref={rootRef} className="relative flex flex-col gap-2">
      <input type="hidden" name={name} value={value} readOnly />

      {chosen ? (
        <div className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2">
          <span className="min-w-0">
            <span className="block truncate text-[0.9375rem] font-medium">{chosen.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{chosen.hint}</span>
          </span>
          <button
            type="button"
            onClick={clear}
            aria-label="Remove referrer"
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={id}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder={placeholder}
            autoComplete="off"
            className="pl-9"
          />
        </div>
      )}

      {open && !chosen && (
        <div className="absolute top-full z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">
              {searching ? "Searching…" : "Nobody matches that."}
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto py-1">
              {results.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => choose(row)}
                    className={cn(
                      "flex min-h-11 w-full flex-col items-start justify-center gap-0.5 px-3 py-1.5 text-left",
                      "hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                    )}
                  >
                    <span className="text-[0.9375rem] font-medium">{row.name}</span>
                    <span className="text-xs text-muted-foreground">{row.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!chosen && term.trim().length === 1 && (
        <p className="text-xs text-muted-foreground">Keep typing — two characters at least.</p>
      )}
    </div>
  );
}
