"use client";

import { Toaster as Sonner } from "sonner";

/**
 * The one place a toast can appear.
 *
 * Mounted in the app layout, themed from the app's own tokens rather than
 * sonner's defaults so a success message is the same green as a paid
 * instalment and an error the same red as an overdue one — the semantic
 * colours in `globals.css` exist precisely so that green means paid
 * everywhere and never decoration.
 *
 * Bottom right on a desktop, bottom centre on a phone, where a thumb is
 * not already covering it.
 */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      mobileOffset={{ bottom: "1rem" }}
      toastOptions={{
        classNames: {
          toast:
            "rounded-lg border bg-popover text-popover-foreground shadow-lg text-sm px-4 py-3",
          description: "text-muted-foreground",
          actionButton: "bg-primary text-primary-foreground rounded-md px-2 py-1 text-xs",
          success: "border-[var(--success)]/40",
          error: "border-destructive/40",
        },
      }}
    />
  );
}
