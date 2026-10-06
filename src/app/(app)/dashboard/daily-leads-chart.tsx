"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { DailyCount } from "@/lib/dashboard/scoreboard";
import { formatDateIST } from "@/lib/format/date";

/**
 * Thirty days of arrivals, as a shape.
 *
 * The dashboard could say "14 new this month" and nothing else, which
 * hides the week nothing came in. Magnitude over time, one series, so one
 * hue and no legend — the heading names it. The admissions line is
 * deliberately not drawn on top of it: leads run in tens and admissions in
 * ones, and two scales on one axis is the chart mistake that makes a good
 * month look flat.
 *
 * The table underneath is screen-reader only. A chart that exists only as
 * pixels is unreadable to somebody using a screen reader and unquotable by
 * anybody who wants the number, and the honest fix is cheap.
 */

function label(date: string): string {
  return formatDateIST(new Date(`${date}T06:00:00Z`), "d MMM");
}

export function DailyLeadsChart({ series }: { series: DailyCount[] }) {
  const data = series.map((day) => ({ ...day, label: label(day.date) }));
  const total = series.reduce((sum, day) => sum + day.leads, 0);

  if (total === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        No leads in the last 30 days. When they arrive — from an ad, the website, or added by
        hand — they will show up here the same day.
      </p>
    );
  }

  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption className="text-sm font-medium">
        New leads, last 30 days{" "}
        <span className="font-normal text-muted-foreground">· {total} in total</span>
      </figcaption>

      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="daily-leads" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              /* Every seventh day: a label per day is unreadable at this width. */
              interval={6}
              minTickGap={8}
            />
            <YAxis
              allowDecimals={false}
              width={48}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                color: "var(--popover-foreground)",
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--muted-foreground)" }}
              formatter={(value) => [Number(value), Number(value) === 1 ? "lead" : "leads"]}
            />
            <Area
              type="monotone"
              dataKey="leads"
              stroke="var(--primary)"
              strokeWidth={2}
              fill="url(#daily-leads)"
              isAnimationActive={false}
              dot={false}
              activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <table className="sr-only">
        <caption>New leads per day, last 30 days</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">New leads</th>
            <th scope="col">Admissions</th>
          </tr>
        </thead>
        <tbody>
          {data.map((day) => (
            <tr key={day.date}>
              <th scope="row">{day.label}</th>
              <td>{day.leads}</td>
              <td>{day.admissions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
