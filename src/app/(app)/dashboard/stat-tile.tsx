/**
 * A secondary figure.
 *
 * `compact` is the variant used under the hero figures: the same number,
 * smaller, because its job is to be there when somebody looks for it
 * rather than to be read first. Three sizes would be two too many.
 */
export function StatTile({
  label,
  value,
  hint,
  compact = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1 rounded-lg border ${compact ? "p-3" : "p-4"}`}>
      <span className={compact ? "text-xs text-muted-foreground" : "text-sm text-muted-foreground"}>
        {label}
      </span>
      <span className={`font-semibold tabular-nums ${compact ? "text-lg" : "text-2xl"}`}>
        {value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
