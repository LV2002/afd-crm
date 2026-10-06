import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * What a screen says when it has nothing to show.
 *
 * "No results" is an accurate sentence and a useless one. Somebody who
 * has just opened a CRM for the first time, or filtered themselves into a
 * corner, needs to know which of those two happened and what to do about
 * it — and the difference between an institute that adopts this system
 * and one that quietly goes back to the spreadsheet is often nothing more
 * than whether the first empty screen explained itself.
 *
 * So: a line that says what is missing, a line that says why it might be,
 * and the button that fixes it where there is one.
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  /** One or two sentences: why this is empty, and what fills it. */
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
      {Icon ? <Icon className="size-8 text-muted-foreground/60" aria-hidden /> : null}
      <p className="font-medium">{title}</p>
      {children ? (
        <p className="max-w-md text-sm text-muted-foreground">{children}</p>
      ) : null}
      {action}
    </div>
  );
}
