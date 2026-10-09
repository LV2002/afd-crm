import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 gap-1",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground",
        /*
         * The soft variants: a tinted pill with the hue's own ink.
         *
         * A solid badge is a shout, and there are places in this app that
         * need to say "paid" or "overdue" a dozen times in one list —
         * twelve solid pills is a ransom note. These carry the same
         * meaning at the weight of a label, which is what a status in a
         * table actually is. The solid variants stay for the single
         * badge that is the point of a screen.
         */
        success: "border-success/25 bg-success-subtle text-success-ink",
        warning: "border-warning/30 bg-warning-subtle text-warning-ink",
        info: "border-info/25 bg-info-subtle text-info-ink",
        danger: "border-destructive/25 bg-destructive-subtle text-destructive-ink",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
