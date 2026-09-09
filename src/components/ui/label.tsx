"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";

import { cn } from "@/lib/utils";

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        // Labels sit at full foreground weight, not muted. A label is the
      // question being asked; greying it out to look tidy is how a form
      // ends up filled in wrong.
      "flex items-center gap-1.5 text-[0.9375rem] leading-snug font-medium text-foreground select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
