"use client";

import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  /** A second line — a counsellor's centre, a course's fee, a template's language. */
  hint?: string;
  disabled?: boolean;
}

/**
 * A dropdown you can type into.
 *
 * The plain `<Select>` this replaces has no search, so choosing a
 * counsellor out of fifteen or a course out of twenty means scrolling a
 * list and reading carefully — which is how somebody picks Foundation
 * when they meant Foundation Repeat, and nobody notices until the fee is
 * wrong. Typing three letters is both faster and harder to get wrong.
 *
 * ## Why this is hand-built
 *
 * It has to work inside `<form action={serverAction}>`, which is how
 * every form in this application submits. So the visible control is a
 * button and the actual value rides on a hidden input — a listbox that
 * cannot post its value would need every one of those forms rewritten
 * around client state.
 *
 * ## Two details that matter more than they look
 *
 * **The search box only appears above `SEARCH_THRESHOLD` options.** A
 * search field over four items is a thing to read, understand and
 * dismiss before you can do the obvious. Below the threshold the list is
 * just a list.
 *
 * **Filtering matches anywhere in the label, not just the start.** People
 * type the distinctive part — "nift" for "NIFT UG Foundation", "kann"
 * for "Kannur — MG Road". Prefix-only matching fails exactly when the
 * list is long enough to need searching.
 */

/** Below this, a search box is noise rather than help. */
const SEARCH_THRESHOLD = 7;

function normalise(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function Combobox({
  name,
  options,
  value: controlledValue,
  defaultValue = "",
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Type to search…",
  emptyText = "Nothing matches that.",
  disabled,
  required,
  clearable = false,
  size = "default",
  id,
  className,
  "aria-describedby": describedBy,
}: {
  /** Set this and the value posts with the surrounding form. */
  name?: string;
  options: ComboboxOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  required?: boolean;
  clearable?: boolean;
  /**
   * "sm" for a filter bar, where this sits in a row of 32px controls and a
   * 40px one would stick out. Everywhere a person is filling in a form,
   * leave it alone: the taller target is the accessible one.
   */
  size?: "default" | "sm";
  id?: string;
  className?: string;
  "aria-describedby"?: string;
}) {
  const isControlled = controlledValue !== undefined;
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const value = isControlled ? controlledValue : uncontrolled;

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [dropUp, setDropUp] = React.useState(false);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const reactId = React.useId();
  const listId = `${reactId}-list`;

  const selected = options.find((option) => option.value === value) ?? null;
  const showSearch = options.length > SEARCH_THRESHOLD;

  const filtered = React.useMemo(() => {
    const needle = normalise(query);
    if (!needle) return options;
    return options.filter(
      (option) =>
        normalise(option.label).includes(needle) ||
        (option.hint ? normalise(option.hint).includes(needle) : false),
    );
  }, [options, query]);

  function commit(next: string) {
    if (!isControlled) setUncontrolled(next);
    onChange?.(next);
    setOpen(false);
    setQuery("");
    // Focus goes back to the trigger, not nowhere. Losing your place
    // after choosing something is disorienting on a long form.
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function openList() {
    if (disabled) return;
    // Flip upwards near the bottom of the window rather than opening a
    // list the person then has to scroll the page to see.
    const rect = triggerRef.current?.getBoundingClientRect();
    setDropUp(Boolean(rect && window.innerHeight - rect.bottom < 280 && rect.top > 300));
    setOpen(true);
    setActiveIndex(
      Math.max(
        0,
        filtered.findIndex((option) => option.value === value),
      ),
    );
  }

  // Close on a click outside or on Escape — the two things everybody
  // tries when they open something by accident.
  React.useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  React.useEffect(() => {
    if (open && showSearch) searchRef.current?.focus();
  }, [open, showSearch]);

  // Keep the highlighted row in view while arrowing through a long list.
  React.useEffect(() => {
    if (!open) return;
    const node = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function onListKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => {
        if (filtered.length === 0) return 0;
        let next = current;
        // Walk past anything disabled rather than parking on it.
        for (let i = 0; i < filtered.length; i += 1) {
          next = (next + step + filtered.length) % filtered.length;
          if (!filtered[next]?.disabled) break;
        }
        return next;
      });
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      if (!open) return;
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : filtered.length - 1);
      return;
    }

    if (event.key === "Enter" || (event.key === " " && !showSearch)) {
      if (!open) {
        event.preventDefault();
        openList();
        return;
      }
      const option = filtered[activeIndex];
      if (option && !option.disabled) {
        event.preventDefault();
        commit(option.value);
      }
      return;
    }

    if (event.key === "Tab" && open) setOpen(false);
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {name && (
        /* The real form field. `required` lives here so the browser's own
           validation still fires on submit, pointing at the trigger. */
        <input
          type="text"
          name={name}
          value={value}
          required={required}
          tabIndex={-1}
          aria-hidden="true"
          readOnly
          onFocus={() => triggerRef.current?.focus()}
          className="pointer-events-none absolute h-px w-px opacity-0"
        />
      )}

      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-haspopup="listbox"
        aria-describedby={describedBy}
        aria-activedescendant={
          open && filtered[activeIndex] ? `${listId}-${activeIndex}` : undefined
        }
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onListKeyDown}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border border-input bg-card",
          size === "sm"
            ? "h-8 px-2.5 py-1 text-sm"
            : "h-10 px-3 py-2 text-base sm:text-[0.9375rem]",
          "shadow-sm transition-colors text-left",
          "hover:border-ring/40",
          "disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-muted",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:border-ring",
          open && "border-ring ring-2 ring-ring ring-offset-1",
        )}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground/70")}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {clearable && selected && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear"
              onClick={(event) => {
                event.stopPropagation();
                commit("");
              }}
              className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-3.5" />
            </span>
          )}
          <ChevronsUpDown className="size-4 opacity-50" />
        </span>
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 w-full min-w-[14rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg",
            dropUp ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          {showSearch && (
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={onListKeyDown}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                aria-controls={listId}
                className="h-11 w-full bg-transparent text-base sm:text-[0.9375rem] outline-none placeholder:text-muted-foreground/70"
              />
            </div>
          )}

          <ul ref={listRef} id={listId} role="listbox" className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</li>
            )}
            {filtered.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <li
                  key={option.value}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled || undefined}
                  onPointerEnter={() => setActiveIndex(index)}
                  onClick={() => !option.disabled && commit(option.value)}
                  className={cn(
                    // Rows are 44px so a thumb hits them, and so the list
                    // is readable rather than a dense stripe of text.
                    "flex min-h-11 cursor-pointer select-none items-center gap-2.5 rounded-sm px-2.5 py-2",
                    "text-[0.9375rem] leading-snug",
                    index === activeIndex && "bg-accent text-accent-foreground",
                    option.disabled && "pointer-events-none opacity-50",
                  )}
                >
                  <Check
                    className={cn("size-4 shrink-0 text-primary", !isSelected && "invisible")}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{option.label}</span>
                    {option.hint && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {option.hint}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
