/**
 * Admissions this month against the target somebody set.
 *
 * Only rendered when a target exists. An invented one would be worse than
 * none: a bar at 0% of a number nobody agreed to is an accusation, and a
 * bar at 100% of an invented number is a lie.
 *
 * The pace marker is the honest part. On the 10th of a 30-day month, a
 * third of the target is where "on course" sits, and without that line a
 * counsellor on 4 of 12 cannot tell whether they are behind or early. It
 * assumes admissions arrive evenly through the month, which they do not —
 * so the label says what it is rather than passing judgement.
 */
export function TargetProgress({
  achieved,
  target,
  paceFraction,
}: {
  achieved: number;
  target: number;
  /** How far through the month we are, 0–1. */
  paceFraction: number;
}) {
  const share = Math.min(achieved / target, 1);
  const pace = Math.min(Math.max(paceFraction, 0), 1);
  const ahead = share >= pace;

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-muted-foreground">Admissions against target</span>
        <span className="text-sm font-medium tabular-nums">
          {achieved} <span className="text-muted-foreground">of {target}</span>
        </span>
      </div>

      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${ahead ? "bg-[var(--success)]" : "bg-primary"}`}
          style={{ width: `${share * 100}%` }}
        />
        {/* The pace marker sits above the fill, so it stays visible either side of it. */}
        <div
          className="absolute top-0 h-full w-0.5 bg-foreground/60"
          style={{ left: `calc(${pace * 100}% - 1px)` }}
          aria-hidden
        />
      </div>

      <p className="text-xs text-muted-foreground">
        The line is where an even month would have you today ({Math.round(pace * target)} of{" "}
        {target}). {ahead ? "You are at or ahead of it." : "You are behind it."}
      </p>
    </div>
  );
}
