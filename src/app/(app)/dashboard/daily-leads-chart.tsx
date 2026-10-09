"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { DailyCount, DailyMeasure } from "@/lib/dashboard/scoreboard";
import { formatDateIST } from "@/lib/format/date";

/**
 * Thirty days of one measure, as a shape.
 *
 * The dashboard could say "14 new this month" and nothing else, which
 * hides the week nothing came in. Magnitude over time, one series, so one
 * hue and no legend — the caption names it. Two measures on one axis is
 * still refused: leads run in tens and admissions in ones, and two
 * scales on one axis is the chart mistake that makes a good month look
 * flat. Which one is drawn is now the reader's choice (see
 * `year-tiles.tsx`) rather than always arrivals.
 *
 * The caption carries the measure's own wording — "arrived that day and
 * are still interested today" — because every measure but enrolments is
 * a cohort read against arrival date, and a chart that let somebody read
 * it as history would be worse than no chart.
 *
 * The table underneath is screen-reader only. A chart that exists only as
 * pixels is unreadable to somebody using a screen reader and unquotable by
 * anybody who wants the number, and the honest fix is cheap.
 */

function label(date: string): string {
  return formatDateIST(new Date(`${date}T06:00:00Z`), "d MMM");
}

export function DailyLeadsChart({
  series,
  measure = "newLeads",
  title = "New leads",
  caption = "arrived that day",
}: {
  series: DailyCount[];
  measure?: DailyMeasure;
  /** The tile's own words, so the chart and the number agree. */
  title?: string;
  /** What a day's bar counts, spelled out — see the module comment. */
  caption?: string;
}) {
  const data = series.map((day) => ({ ...day, label: label(day.date), value: day[measure] }));
  const total = series.reduce((sum, day) => sum + day[measure], 0);

  if (total === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        Nothing to draw: no {title.toLowerCase()} in the last 30 days. A day counts a lead that{" "}
        {caption}.
      </p>
    );
  }

  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption className="text-sm font-medium">
        {title}, last 30 days{" "}
        <span className="font-normal text-muted-foreground">· {total} in total</span>
        <span className="block text-xs font-normal text-muted-foreground">
          Each day counts leads that {caption}.
        </span>
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
              formatter={(value) => [Number(value), title]}
            />
            <Area
              type="monotone"
              dataKey="value"
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

      {/*
        `sr-only` goes on a WRAPPER, never on the <table> itself.

        This was the 173px of sideways scroll on /dashboard at phone width,
        and it is a nasty one. `sr-only` is `width: 1px; overflow: hidden;
        white-space: nowrap`, which works on anything that can be 1px wide
        — and a table cannot: a table box will not shrink below its minimum
        content width, so with `nowrap` holding the caption on one line the
        box came out 746px wide. `overflow: hidden` then clips the table's
        CONTENTS and not the table box, and because `sr-only` is also
        `position: absolute`, that 746px box reports straight into the
        document's scrollable width. A table nobody can see was dragging
        every page sideways on a phone.

        A <div> does honour `width: 1px`, so the clipping happens one level
        up and nothing escapes. Measured against the built CSS at 412px:
        374px of page overflow with the class on the table, 0 with it on a
        wrapper. The table is unchanged and still reads out the same way.

        It surfaced when the caption grew — a longer sentence is a wider
        nowrap box — which is why it looked like it arrived with an
        unrelated change.
      */}
      <div className="sr-only">
        <table>
          <caption>
            {title} per day, last 30 days. Each day counts leads that {caption}.
          </caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">{title}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((day) => (
              <tr key={day.date}>
                <th scope="row">{day.label}</th>
                <td>{day.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
