"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { COHORT_DAYS, type CohortRow } from "@/lib/reports/cohorts";

/**
 * How fast each month's leads decide — one line per arrival month.
 *
 * The one chart in this CRM that genuinely needs colour to carry
 * identity: the lines are six different cohorts, and which is which is
 * the question. So it uses the validated categorical theme in its fixed
 * slot order (`--series-1` … `--series-6` in globals.css), assigned by
 * position and never cycled. Three of those steps sit under 3:1 on a
 * white background, which the validator allows only where identity is
 * also carried by something other than colour — hence the legend here
 * and the table on the page below.
 *
 * **Six cohorts, not all of them.** A seventh line would need a seventh
 * hue, and past six the adjacent pairs stop being separable for a
 * colourblind reader. The table underneath still lists every month.
 *
 * A cohort too young to have a 90-day number has no point at 90 — not a
 * zero, a gap. Recharts draws a line with `connectNulls` off, so the
 * line simply stops, which is the honest picture: we do not know yet.
 */

const SERIES = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
];

/** Newest months first is how the table reads; the chart wants oldest first. */
export function CohortCurvesChart({ rows }: { rows: CohortRow[] }) {
  const shown = rows.slice(0, SERIES.length);
  if (shown.length === 0) return null;

  const data = COHORT_DAYS.map((day) => {
    const point: Record<string, number | string | null> = { day: `${day}d` };
    for (const row of shown) {
      const rate = row.rates[day];
      point[row.cohort] = rate === null ? null : Math.round(rate * 1000) / 10;
    }
    return point;
  });

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="day"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
          />
          <YAxis
            unit="%"
            width={52}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--muted-foreground)" }}
            formatter={(value, name) => [`${Number(value)}%`, String(name)]}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }}
            iconType="plainline"
          />
          {shown.map((row, index) => (
            <Line
              key={row.cohort}
              type="monotone"
              dataKey={row.cohort}
              stroke={SERIES[index]}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0, fill: SERIES[index] }}
              activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
              isAnimationActive={false}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
