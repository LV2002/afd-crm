"use client";

import { useState } from "react";

import type { CounsellorYear, DailyCount, DailyMeasure } from "@/lib/dashboard/scoreboard";

import { DailyLeadsChart } from "./daily-leads-chart";
import { StatTile } from "./stat-tile";

/**
 * The year row, and the chart it drives.
 *
 * Leon: *"under your year so far section i should be able to select each
 * card and the graph on top should show the data for that tag."* So the
 * tiles are buttons, the chart is whichever one is pressed, and New
 * leads is where it starts — which is what the chart always showed.
 *
 * ## The one thing the chart cannot honestly be
 *
 * It is not history. The CRM keeps no daily record of what a lead's
 * temperature or stage *was*, so "Interested on 3 June" cannot mean
 * "was interested on 3 June". It means **arrived on 3 June and is
 * interested today** — a cohort read, stated in the caption rather than
 * left for somebody to assume.
 *
 * That is the more useful question anyway: a week whose leads all went
 * cold shows as a dip in Interested while New leads stayed flat, which
 * is exactly the week worth asking about. Interpolating a history we do
 * not have would draw a chart that looks like evidence and is not.
 *
 * Client-side because the selection is a view preference and nothing
 * else: every series is already on this page, so switching is instant
 * and costs no round trip. It is deliberately not in the URL — the
 * dashboard is somewhere people land, not somewhere they share a link
 * to a particular reading of.
 */

interface Tile {
  measure: DailyMeasure;
  label: string;
  value: number;
  /** Said in the chart caption when this one is selected. */
  caption: string;
}

export function YearTiles({
  year,
  series,
  cycleStartedOn,
  admissionRate,
}: {
  year: CounsellorYear;
  series: DailyCount[];
  cycleStartedOn: string;
  /** Not a measure — the month's running rate, so it cannot drive the chart. */
  admissionRate: string;
}) {
  const [measure, setMeasure] = useState<DailyMeasure>("newLeads");

  const tiles: Tile[] = [
    {
      measure: "activeLeads",
      label: "Active leads",
      value: year.activeLeads,
      caption: "arrived that day and still being worked",
    },
    {
      measure: "newLeads",
      label: "New leads",
      value: year.newLeads,
      caption: "arrived that day",
    },
    {
      measure: "contacted",
      label: "Contacted",
      value: year.contacted,
      caption: "arrived that day and have been answered at least once",
    },
    {
      measure: "neverContacted",
      label: "Never contacted",
      value: year.neverContacted,
      caption: "arrived that day and have never been answered",
    },
    {
      measure: "overdueFollowups",
      label: "Overdue follow-ups",
      value: year.overdueFollowups,
      caption: "arrived that day and are now past their follow-up date",
    },
    {
      measure: "interested",
      label: "Interested",
      value: year.interested,
      caption: "arrived that day and are still interested today",
    },
    {
      measure: "enrolments",
      label: "Enrolments",
      value: year.enrolments,
      caption: "admissions confirmed that day",
    },
  ];

  const selected = tiles.find((tile) => tile.measure === measure) ?? tiles[1];

  return (
    <div className="flex flex-col gap-5">
      <DailyLeadsChart
        series={series}
        measure={selected.measure}
        title={selected.label}
        caption={selected.caption}
      />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium">Your year so far</h3>
          <p className="text-xs text-muted-foreground">
            Since {cycleStartedOn} · pick one to redraw the chart
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((tile) => (
            <button
              key={tile.measure}
              type="button"
              onClick={() => setMeasure(tile.measure)}
              aria-pressed={tile.measure === measure}
              className={
                // The ring rather than a fill: these sit in a row of
                // numbers and a filled tile would read as a different
                // kind of figure rather than the selected one.
                tile.measure === measure
                  ? "rounded-lg text-left ring-2 ring-primary"
                  : "rounded-lg text-left transition-colors hover:ring-2 hover:ring-border"
              }
            >
              <StatTile label={tile.label} value={tile.value} compact />
            </button>
          ))}
          {/* Not a button: the admission rate is this month's running
              figure, not a count of anything per day, so there is no
              honest series to draw for it. */}
          <StatTile label="Admission rate" value={admissionRate} compact />
        </div>
      </div>
    </div>
  );
}
