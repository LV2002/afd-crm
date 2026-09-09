import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * 40px tall with 15px text, up from 36px and 14px.
 *
 * Small controls are the first thing that goes wrong for an older user
 * and the last thing anybody notices, because whoever built it could
 * read them fine. `text-base` on small screens is also what stops iOS
 * zooming the whole page in when a field is focused.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2",
        "text-base sm:text-[0.9375rem] shadow-sm transition-colors",
        "placeholder:text-muted-foreground/70",
        "hover:border-ring/40",
        "disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-muted",
        "aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-destructive/40",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:border-ring",
        // Number fields: the spinner is a nuisance on a fee amount and a
        // real hazard on a phone, where a stray scroll changes the value.
        "[&[type=number]]:[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
