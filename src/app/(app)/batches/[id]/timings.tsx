"use client";

import { useActionState, useTransition } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dayName, formatTime } from "@/lib/faculty/availability";

import { addBatchSession, removeBatchSession, type BatchFormState } from "../actions";

export interface TimingRow {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  daySession: "morning" | "evening";
}

const EMPTY: BatchFormState = {};

/**
 * When this batch meets, week in and week out.
 *
 * AFD decides timings late — a batch is confirmed on Thursday for
 * Saturday — so this sits on the batch page as a few fields and a list,
 * not behind a wizard. Add a row, remove a row, done.
 *
 * The total is shown because it is the number that matters: hours a week
 * is what the syllabus pacing check divides by, and "6 hours a week" tells
 * the coordinator immediately whether a 54-hour plan can land before
 * November.
 */
export function BatchTimings({
  batchId,
  rows,
  canEdit,
}: {
  batchId: string;
  rows: TimingRow[];
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(addBatchSession, EMPTY);
  const [busy, startBusy] = useTransition();

  const weeklyHours = rows.reduce((sum, row) => sum + hoursBetween(row.startTime, row.endTime), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Class timings</h2>
        {rows.length > 0 ? (
          <span className="text-sm tabular-nums text-muted-foreground">
            {round2(weeklyHours)} hours a week
          </span>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No timings yet. Until they are here the timetable cannot be generated for this batch,
          and the syllabus pacing check has nothing to measure against.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border text-sm">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 p-3">
              <span className="w-24 font-medium">{dayName(row.dayOfWeek)}</span>
              <span className="tabular-nums">
                {formatTime(row.startTime)} – {formatTime(row.endTime)}
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {row.daySession === "morning" ? "Morning" : "Evening"}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {round2(hoursBetween(row.startTime, row.endTime))} h
              </span>
              {canEdit ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  disabled={busy}
                  aria-label={`Remove ${dayName(row.dayOfWeek)} ${formatTime(row.startTime)}`}
                  onClick={() =>
                    startBusy(async () => {
                      await removeBatchSession(row.id, batchId);
                    })
                  }
                >
                  <X className="size-3.5" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <form action={action} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="batchId" value={batchId} />

          <div className="flex flex-col gap-1">
            <Label htmlFor="timing-day" className="text-xs">
              Day
            </Label>
            <select
              id="timing-day"
              name="dayOfWeek"
              defaultValue="6"
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                <option key={day} value={day}>
                  {dayName(day)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="timing-from" className="text-xs">
              From
            </Label>
            <Input id="timing-from" name="startTime" type="time" defaultValue="10:00" className="w-28" />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="timing-to" className="text-xs">
              To
            </Label>
            <Input id="timing-to" name="endTime" type="time" defaultValue="13:00" className="w-28" />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="timing-half" className="text-xs">
              Half
            </Label>
            <select
              id="timing-half"
              name="daySession"
              defaultValue="morning"
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="morning">Morning</option>
              <option value="evening">Evening</option>
            </select>
          </div>

          <Button type="submit" variant="outline" disabled={pending}>
            <Plus className="size-4" />
            {pending ? "Adding…" : "Add"}
          </Button>

          {state.error ? <p className="w-full text-sm text-destructive">{state.error}</p> : null}
          {state.success ? (
            <p className="w-full text-sm text-muted-foreground">{state.success}</p>
          ) : null}
        </form>
      ) : null}

      <p className="text-xs text-muted-foreground">
        The half decides which attendance column a class lands in, so a batch that meets twice on
        one day gets two rows — one morning, one evening.
      </p>
    </div>
  );
}

function hoursBetween(start: string, end: string): number {
  const toMinutes = (value: string) => {
    const [h, m] = value.split(":");
    return Number(h) * 60 + Number(m);
  };
  const span = toMinutes(end) - toMinutes(start);
  return span > 0 ? span / 60 : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
