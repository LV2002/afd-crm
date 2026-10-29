"use client";

import { useState } from "react";

import { measureHref, type MeasureKey, type MeasureOwner } from "@/lib/dashboard/measures";

import type { CounsellorYear, DailyCount, DailyMeasure } from "@/lib/dashboard/scoreboard";

import { DailyLeadsChart } from "./daily-leads-chart";
import { StatTile, type StatTone } from "./stat-tile";

/**
 * The year row, and the chart above it.
 *
 * Each tile opens the leads behind its number (`?tile=`), which is what
 * Leon asked for last. The chart used to be driven by pressing a tile;
 * that moved to a small "Chart shows" row of its own, because a tile cannot
 * be both a link and a button. New leads is where it starts — which is what
 * the chart always showed.
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
  /**
   * Which of these numbers is good news and which is work. Seven
   * identical boxes told you neither; see stat-tile.tsx.
   */
  tone: StatTone;
  /** The leads-page measure whose list this tile opens. */
  link: MeasureKey;
}

export function YearTiles({
  owner,
  year,
  series,
  cycleStartedOn,
  admissionRate,
}: {
  /** Whose leads the tiles open: a counsellor's id, or `all`. */
  owner: MeasureOwner;
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
      tone: "info",
      link: "y_active",
    },
    {
      measure: "newLeads",
      label: "New leads",
      value: year.newLeads,
      caption: "arrived that day",
      tone: "neutral",
      link: "y_new",
    },
    {
      measure: "contacted",
      label: "Contacted",
      value: year.contacted,
      caption: "arrived that day and have been answered at least once",
      tone: "neutral",
      link: "y_contacted",
    },
    {
      measure: "neverContacted",
      label: "Never contacted",
      value: year.neverContacted,
      caption: "arrived that day and have never been answered",
      tone: "attention",
      link: "y_never_contacted",
    },
    {
      measure: "overdueFollowups",
      label: "Overdue follow-ups",
      value: year.overdueFollowups,
      caption: "arrived that day and are now past their follow-up date",
      tone: "overdue",
      link: "y_overdue",
    },
    {
      measure: "interested",
      label: "Interested",
      value: year.interested,
      caption: "arrived that day and are still interested today",
      tone: "primary",
      link: "y_interested",
    },
    {
      measure: "enrolments",
      label: "Enrolments",
      value: year.enrolments,
      caption: "admissions confirmed that day",
      tone: "good",
      link: "y_enrolments",
    },
  ];

  const selected = tiles.find((tile) => tile.measure === measure) ?? tiles[1];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="What the chart shows">
          <span className="mr-1 text-xs text-muted-foreground">Chart shows</span>
          {tiles.map((tile) => (
            <button
              key={tile.measure}
              type="button"
              onClick={() => setMeasure(tile.measure)}
              aria-pressed={tile.measure === measure}
              className={
                tile.measure === measure
                  ? "rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground"
                  : "rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent/50"
              }
            >
              {tile.label}
            </button>
          ))}
        </div>
        <DailyLeadsChart
          series={series}
          measure={selected.measure}
          title={selected.label}
          caption={selected.caption}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium">Your year so far</h3>
          <p className="text-xs text-muted-foreground">
            Since {cycleStartedOn} · click a figure to see those leads
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((tile) => (
            <StatTile
              key={tile.measure}
              label={tile.label}
              value={tile.value}
              tone={tile.tone}
              href={measureHref(tile.link, owner)}
              compact
            />
          ))}
          {/* Not a link: the admission rate is this month's running
              figure, not a count of leads. */}
          <StatTile label="Admission rate" value={admissionRate} compact />
        </div>
      </div>
    </div>
  );
}
