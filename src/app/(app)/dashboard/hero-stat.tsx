"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

/**
 * One figure, big, with what it was last month and the shape of the last
 * fortnight.
 *
 * The dashboard used to be eight bordered boxes of identical weight, which
 * is a wall of numbers rather than an answer: nothing told a counsellor
 * which of the eight was the one to look at, and no number said whether it
 * was good. Three of them are promoted here and the rest demoted to a
 * compact row, because "how am I doing" has three answers, not eight.
 *
 * A delta is never colour alone — the arrow and the sentence say the same
 * thing, so it reads the same in greyscale, in a screenshot, and to
 * somebody who does not see the green.
 */

export interface HeroStatProps {
  label: string;
  value: number | string;
  /** What this figure was over the whole of last month, when that comparison means something. */
  previous?: number | null;
  /** Counts per day, oldest first. Fourteen points is enough for a shape and small enough to stay honest. */
  series?: number[];
  hint?: string;
  /**
   * `attention` tints the number itself: this is a figure somebody is
   * supposed to act on, and zero is the good outcome. Used for overdue
   * work, never for a figure that is merely large.
   */
  tone?: "default" | "attention";
}

function Delta({ value, previous }: { value: number; previous: number }) {
  const change = value - previous;
  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : ArrowRight;
  const colour =
    change > 0 ? "text-[var(--success)]" : change < 0 ? "text-destructive" : "text-muted-foreground";
  const words =
    change === 0
      ? `Same as last month (${previous})`
      : `${change > 0 ? "Up" : "Down"} ${Math.abs(change)} on last month (${previous})`;

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${colour}`}>
      <Icon aria-hidden className="size-3.5" />
      {words}
    </span>
  );
}

/**
 * Fourteen days of shape, no axes and no numbers.
 *
 * A sparkline answers "which way is this going" and nothing else; the
 * figure beside it is the value. One hue — the theme's own primary, so it
 * is correct in dark mode without a second palette — because a single
 * series needs no identity colour.
 */
function Sparkline({ series, label }: { series: number[]; label: string }) {
  const data = series.map((count, index) => ({ index, count }));
  const flat = series.every((count) => count === series[0]);

  return (
    <div className="h-10 w-full" aria-hidden>
      {/* A flat line at zero is noise pretending to be information. */}
      {flat && series[0] === 0 ? null : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`spark-${label.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="count"
              stroke="var(--primary)"
              strokeWidth={2}
              fill={`url(#spark-${label.replace(/\W/g, "")})`}
              isAnimationActive={false}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function HeroStat({ label, value, previous, series, hint, tone = "default" }: HeroStatProps) {
  const numeric = typeof value === "number" ? value : null;
  const attention = tone === "attention" && numeric !== null && numeric > 0;

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
      <span className="text-sm text-muted-foreground">{label}</span>

      <span
        className={`text-4xl font-semibold leading-none tabular-nums ${
          attention ? "text-destructive" : ""
        }`}
      >
        {value}
      </span>

      {numeric !== null && previous !== null && previous !== undefined ? (
        <Delta value={numeric} previous={previous} />
      ) : null}

      {series && series.length > 1 ? <Sparkline series={series} label={label} /> : null}

      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}
