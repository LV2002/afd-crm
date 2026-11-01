"use client";

import { useTransition } from "react";

import { setFinanceCenter } from "@/lib/finance/center-actions";
import { cn } from "@/lib/utils";

/**
 * Whole company or one centre. Chosen once, applied to every finance tab.
 * Only shown to someone who can see more than one centre.
 */
export function CenterSwitcher({
  centers,
  selected,
}: {
  centers: Array<{ id: string; name: string }>;
  selected: string | undefined;
}) {
  const [pending, startTransition] = useTransition();
  const choose = (id: string) => startTransition(() => setFinanceCenter(id));

  const options = [{ id: "", name: "All centres" }, ...centers];
  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", pending && "opacity-60")}
      role="group"
      aria-label="Centre"
    >
      <span className="text-sm text-muted-foreground">Showing</span>
      {options.map((o) => {
        const active = (selected ?? "") === o.id;
        return (
          <button
            key={o.id || "all"}
            type="button"
            aria-pressed={active}
            onClick={() => choose(o.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              active ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            {o.name}
          </button>
        );
      })}
    </div>
  );
}
