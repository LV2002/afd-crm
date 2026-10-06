import type { FieldOption } from "@/lib/fields/resolve-field-options";

/**
 * A stage or a temperature, with the colour an admin gave it.
 *
 * Scanning two hundred leads for "who is at Demo Scheduled" is a reading
 * task when every stage is the same grey text, and a glance when each one
 * has a colour. The colours already existed — `pipeline_stages.color` and
 * `dropdown_options.color` are editable in Settings — and nothing drew
 * them.
 *
 * **The label stays in text ink.** The colour is a dot and a wash behind
 * the pill, never the text itself: an admin can pick any hex, including a
 * pale yellow that would be invisible as text on white, and a list that
 * becomes unreadable because somebody chose a colour is a worse outcome
 * than a list with no colour at all. `color-mix` keeps the wash at 14%
 * against whatever the surface is, so it works in both themes without a
 * second palette.
 *
 * With no colour set it falls back to a plain pill, which is what the
 * list looked like before — so this is never worse than what it replaces.
 */
export function OptionBadge({ option, fallback }: { option?: FieldOption; fallback?: string }) {
  const label = option?.label ?? fallback;
  if (!label) return <span className="text-muted-foreground">—</span>;

  const colour = option?.color;

  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
      style={
        colour
          ? {
              backgroundColor: `color-mix(in oklab, ${colour} 14%, transparent)`,
              borderColor: `color-mix(in oklab, ${colour} 38%, transparent)`,
            }
          : undefined
      }
    >
      {colour ? (
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: colour }}
        />
      ) : null}
      <span className="truncate">{label}</span>
    </span>
  );
}
