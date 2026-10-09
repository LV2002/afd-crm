/**
 * A secondary figure.
 *
 * `compact` is the variant used under the hero figures: the same number,
 * smaller, because its job is to be there when somebody looks for it
 * rather than to be read first. Three sizes would be two too many.
 *
 * ## Why these are coloured
 *
 * A row of seven identical bordered boxes is a wall of numbers: nothing
 * says which one is good news, which one is work, and which one is just a
 * count. `tone` says it in the one place the eye lands first — the figure
 * itself — using the palette's semantic inks, so overdue reads as overdue
 * on a dashboard somebody glances at twenty times a day.
 *
 * Colour is never the only signal. Every tile still carries its label in
 * words, so the meaning survives greyscale printing, a screenshot, and
 * colour vision deficiency; the tone is a shortcut to the label, not a
 * replacement for it.
 */

/**
 * `neutral` is the default and stays deliberately uncoloured — a count
 * with no judgement attached should not look like one with judgement
 * attached. If every tile is coloured, none of them are.
 */
export type StatTone = "neutral" | "primary" | "info" | "good" | "attention" | "overdue";

const TONES: Record<StatTone, { box: string; value: string }> = {
  neutral: { box: "border-border bg-card", value: "" },
  primary: { box: "border-primary/25 bg-primary-subtle", value: "text-primary-ink" },
  info: { box: "border-info/25 bg-info-subtle", value: "text-info-ink" },
  good: { box: "border-success/25 bg-success-subtle", value: "text-success-ink" },
  attention: { box: "border-warning/30 bg-warning-subtle", value: "text-warning-ink" },
  overdue: { box: "border-destructive/25 bg-destructive-subtle", value: "text-destructive-ink" },
};

export function StatTile({
  label,
  value,
  hint,
  compact = false,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  hint?: string;
  compact?: boolean;
  tone?: StatTone;
}) {
  const palette = TONES[tone];

  return (
    <div
      className={`flex h-full flex-col gap-1 rounded-lg border ${palette.box} ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <span className={compact ? "text-xs text-muted-foreground" : "text-sm text-muted-foreground"}>
        {label}
      </span>
      <span
        className={`font-semibold tabular-nums ${palette.value} ${
          compact ? "text-lg" : "text-2xl"
        }`}
      >
        {value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
