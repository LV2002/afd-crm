"use client";

import { Command } from "cmdk";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { NAV_ICONS } from "@/components/layout/nav-icons";
import type { NavItem } from "@/lib/auth/nav";
import { searchForPalette, type PaletteHit } from "@/app/(app)/palette-search";

/**
 * Ctrl-K, type a name, press Enter.
 *
 * For somebody in this CRM eight hours a day, reaching a lead was four
 * actions: open the leads list, wait for it, type in the search box, wait
 * again, click the row. This is one keystroke and one word, from any
 * screen, and it is the single biggest speed change available to a
 * counsellor who knows who they are looking for.
 *
 * ## Two rules it inherits rather than invents
 *
 * **Scope.** The search runs on the server through the RLS-bound client,
 * so it finds exactly what the person could have found by scrolling the
 * list themselves. The palette is a faster route to their own data, never
 * a route around the boundary.
 *
 * **Masked numbers.** Results show `+91 98••••3456`. A search box that
 * returned full numbers per keystroke would be the most efficient bulk
 * export in the building — non-negotiable #6 exists for exactly that.
 *
 * ## Why the navigation items are passed in
 *
 * They are the same `navItemsFor(user, terms)` the sidebar renders, so
 * the palette can never offer a screen somebody is not allowed to open,
 * and renaming "Leads" to "Enquiries" in Settings renames it here too.
 */

const DEBOUNCE_MS = 180;

export function CommandPalette({ items }: { items: NavItem[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [term, setTerm] = React.useState("");
  const [hits, setHits] = React.useState<PaletteHit[]>([]);
  const [searching, setSearching] = React.useState(false);

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((previous) => !previous);
      }
      // Escape closes it from anywhere inside, including the input.
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /*
    Debounced, and every in-flight result is dropped once the term has
    moved on: typing "aleena" fires six searches and they do not come back
    in order, so without the guard the list can settle on the results for
    "ale".
  */
  React.useEffect(() => {
    if (term.trim().length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let current = true;
    const timer = setTimeout(async () => {
      const found = await searchForPalette(term);
      if (!current) return;
      setHits(found);
      setSearching(false);
    }, DEBOUNCE_MS);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [term]);

  function go(href: string) {
    setOpen(false);
    setTerm("");
    router.push(href);
  }

  return (
    <>
      {/*
        A visible way in, not only a shortcut. Most of the people using
        this CRM have never pressed Ctrl-K in their lives, and a feature
        nobody can see is a feature nobody has.
      */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:flex"
      >
        <Search className="size-4" />
        <span>Search</span>
        <kbd className="rounded border px-1 py-0.5 text-[0.6875rem]">Ctrl K</kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:hidden"
      >
        <Search className="size-4" />
      </button>

      {open ? (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border bg-popover shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <Command shouldFilter={false} loop>
          <div className="flex items-center border-b px-3">
            <Command.Input
              autoFocus
              value={term}
              onValueChange={setTerm}
              placeholder="Search a name or number, or jump to a screen…"
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="ml-2 shrink-0 rounded border px-1.5 py-0.5 text-[0.6875rem] text-muted-foreground">
              Esc
            </kbd>
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
              {term.trim().length < 2
                ? "Type at least two letters."
                : searching
                  ? "Searching…"
                  : "Nothing matches."}
            </Command.Empty>

            {hits.length > 0 && (
              <Command.Group
                heading="People"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {hits.map((hit) => (
                  <Command.Item
                    key={`${hit.kind}-${hit.id}`}
                    value={`${hit.kind}-${hit.id}`}
                    onSelect={() =>
                      go(hit.kind === "lead" ? `/leads/${hit.id}` : `/students/${hit.id}`)
                    }
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm data-[selected=true]:bg-accent"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{hit.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {hit.phone}
                    </span>
                    <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[0.6875rem] text-muted-foreground">
                      {hit.kind === "lead" ? "Lead" : "Student"}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            <Command.Group
              heading="Go to"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
            >
              {items
                .filter((item) =>
                  term.trim().length < 2
                    ? true
                    : item.label.toLowerCase().includes(term.trim().toLowerCase()),
                )
                .map((item) => {
                  const Icon = NAV_ICONS[item.iconKey];
                  return (
                    <Command.Item
                      key={item.href}
                      value={item.href}
                      onSelect={() => go(item.href)}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm data-[selected=true]:bg-accent"
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{item.label}</span>
                    </Command.Item>
                  );
                })}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
      ) : null}
    </>
  );
}
