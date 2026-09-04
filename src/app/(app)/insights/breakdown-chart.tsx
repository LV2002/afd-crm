"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { PivotRow } from "@/lib/reports/pivot";

/**
 * The current breakdown, whatever it is being broken down by — one chart
 * where there used to be a chart per report.
 *
 * Magnitude across categories, not identity, so a single consistent hue
 * (the theme's own --primary token, correct in both light and dark
 * automatically) rather than one colour per bar. See the dataviz skill's
 * form/colour guidance: colour encodes a second variable only when there
 * is one.
 */
export function BreakdownChart({ data }: { data: PivotRow[] }) {
  // A long tail of one-lead categories makes the bars unreadable and says
  // nothing; the table below it still lists every row.
  const shown = data.slice(0, 15);

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={shown} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            interval={0}
            angle={shown.length > 6 ? -25 : 0}
            textAnchor={shown.length > 6 ? "end" : "middle"}
            height={shown.length > 6 ? 64 : 30}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
          />
          <Bar dataKey="total" name="Leads" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={64} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
