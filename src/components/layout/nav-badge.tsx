import { cn } from "@/lib/utils";

/**
 * The red count beside a queue in the nav, and beside a section tab.
 *
 * Deliberately loud. The whole point is to be noticed by somebody who was
 * not looking for it — a person in academics whose screen is the student
 * roster has no reason to go hunting for a queue, so the queue has to
 * announce itself. Zero renders nothing at all: a grey "0" is noise that
 * teaches people to stop reading the badges that matter.
 *
 * `aria-label` spells out what the number means, because "5" read on its
 * own next to "Students" tells a screen-reader user nothing.
 */
export function NavBadge({
  count,
  what,
  className,
}: {
  count: number | undefined;
  /** What is being counted, for the accessible label: "waiting to be onboarded". */
  what: string;
  className?: string;
}) {
  if (!count || count <= 0) return null;

  return (
    <span
      // Tabular digits so a two-digit count does not shift the row, and a
      // cap at 99+ so a neglected queue cannot stretch the sidebar.
      className={cn(
        "ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[0.6875rem] font-semibold leading-none text-destructive-foreground tabular-nums",
        className,
      )}
      aria-label={`${count} ${what}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
