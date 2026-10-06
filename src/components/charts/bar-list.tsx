/**
 * A ranked list of bars — the honest answer to "which of these is
 * biggest", and the shape most of this CRM's reports actually need.
 *
 * Not a pie chart. Fifteen sources in a pie is fifteen wedges nobody can
 * compare; the same fifteen as a sorted bar list is read top to bottom in
 * a second, and the labels sit beside the bars rather than in a legend
 * somebody has to look back and forth from.
 *
 * Plain CSS, no charting library: it renders on the server inside the
 * page that computed the numbers, so it costs nothing to ship and works
 * before JavaScript does. One hue, because a single measure across
 * categories is magnitude — colour here would encode a variable that
 * does not exist.
 *
 * `reference` draws the line a reader needs to judge a row against: the
 * institute's own average. Without it "18%" is a number; with it, it is
 * above or below the line.
 */
export interface BarListRow {
  label: string;
  /** What the bar's length means. */
  value: number;
  /** What to print at the right — formatted, because this component does not know about ₹ or %. */
  display: string;
  /** A second line under the label, for the count behind a rate. */
  hint?: string;
  href?: string;
}

export function BarList({
  rows,
  reference,
  referenceLabel,
  emptyMessage = "Nothing to show for these filters yet.",
}: {
  rows: BarListRow[];
  /** A value on the same scale as `value` — usually the average. */
  reference?: number | null;
  referenceLabel?: string;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  // The widest bar sets the scale, so the list always fills its space —
  // a chart scaled to a theoretical maximum wastes most of the width and
  // flattens the differences that are the point of drawing it.
  const widest = Math.max(...rows.map((row) => Math.abs(row.value)), 1);
  const referenceShare =
    reference !== null && reference !== undefined ? Math.min(reference / widest, 1) : null;

  return (
    <div className="relative flex flex-col gap-2">
      {referenceShare !== null && (
        <div
          className="pointer-events-none absolute inset-y-0 z-10 w-px bg-foreground/35"
          style={{ left: `${referenceShare * 100}%` }}
          aria-hidden
        />
      )}

      {rows.map((row) => {
        const share = Math.min(Math.abs(row.value) / widest, 1);
        return (
          <div key={row.label} className="flex items-center gap-3">
            <div className="relative h-8 flex-1 overflow-hidden rounded-md bg-muted/60">
              <div
                className="absolute inset-y-0 left-0 rounded-md bg-primary/20"
                style={{ width: `${share * 100}%` }}
              />
              {/* The label sits on top of its own bar rather than in a
                  column beside it: it keeps long names readable at any
                  width and stops the list collapsing on a phone. */}
              <div className="relative flex h-full items-center gap-2 px-2.5 text-sm">
                <span className="truncate font-medium">
                  {row.href ? (
                    <a href={row.href} className="hover:underline">
                      {row.label}
                    </a>
                  ) : (
                    row.label
                  )}
                </span>
                {row.hint ? (
                  <span className="shrink-0 truncate text-xs text-muted-foreground">{row.hint}</span>
                ) : null}
              </div>
            </div>
            <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums">
              {row.display}
            </span>
          </div>
        );
      })}

      {referenceShare !== null && referenceLabel ? (
        <p className="text-xs text-muted-foreground">
          <span aria-hidden className="mr-1 inline-block h-3 w-px translate-y-0.5 bg-foreground/35" />
          {referenceLabel}
        </p>
      ) : null}
    </div>
  );
}
