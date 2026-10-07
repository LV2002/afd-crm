import * as React from "react";

import { cn } from "@/lib/utils";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

/**
 * ## There is no sticky header, and there cannot be one here
 *
 * There was a `sticky` prop. It pinned the headings with `top-14` to clear
 * the app header, it looked right in isolation, and on the leads list it
 * covered the first lead — permanently, not only while scrolling.
 *
 * The wrapper above sets `overflow-x-auto` so a wide table can be scrolled
 * sideways. CSS turns that into a **scroll container** on both axes, and a
 * `position: sticky` element resolves its offsets against the nearest
 * scroll container rather than the viewport. That container never scrolls
 * vertically, so the heading row's position inside it is always zero —
 * below the `top: 56px` threshold — and sticky duly pushed it down 56px,
 * straight over the first row, leaving a gap where it used to be.
 *
 * Making it work means giving up either the sideways scroll (the wrapper)
 * or page scrolling (a fixed-height, inner-scrolling table). Neither is
 * worth a convenience, so the prop is gone rather than left as something
 * that reads as working and is not. If pinned headings are wanted later,
 * the inner-scroll version is the one to build, deliberately.
 */
function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("[&_tr]:border-b", className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "h-10 whitespace-nowrap px-3 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      className={cn("p-3 align-middle [&:has([role=checkbox])]:pr-0", className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
