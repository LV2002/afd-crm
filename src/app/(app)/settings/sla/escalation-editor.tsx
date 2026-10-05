"use client";

import { Plus, Trash2 } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { describeHours, escalationsToJson } from "@/lib/sla/policy-copy";

export interface EscalationRow {
  atHours: number;
  notifyOwner: boolean;
  unassign: boolean;
}

/**
 * What happens when a target is missed, as rows instead of JSON.
 *
 * This was a textarea whose placeholder read
 * `[{ "at_hours": 12, "notify_owner": true }]`, which asks an administrator
 * to hand-write a JSON array with keys they have no way of discovering.
 * Worse, the placeholder taught one that does not exist: `flag_breach` is
 * in a schema comment and nothing reads it, so the example anybody copied
 * produced a rung that silently did nothing.
 *
 * The stored shape is unchanged — the same array, posted from a hidden
 * field — so existing policies keep working and the sweep did not have to
 * learn anything new.
 *
 * ## Why hours past the target, not hours from the start
 *
 * Because that is what the sweep compares against, and a UI that converts
 * between the two invites the off-by-one nobody notices until a centre
 * head is woken at the wrong time. "2 hours late" is also how a person
 * describes it out loud.
 */
export function EscalationEditor({
  name = "escalations",
  defaultRows = [],
}: {
  name?: string;
  defaultRows?: EscalationRow[];
}) {
  const [rows, setRows] = React.useState<EscalationRow[]>(defaultRows);

  // Keyed by index is wrong the moment a row is deleted, so each row
  // carries a stable key of its own.
  const keys = React.useRef<number[]>(defaultRows.map((_, index) => index));
  const nextKey = React.useRef(defaultRows.length);

  function update(index: number, patch: Partial<EscalationRow>) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function add() {
    keys.current = [...keys.current, nextKey.current++];
    setRows((current) => [
      ...current,
      { atHours: current.length === 0 ? 0 : 24, notifyOwner: true, unassign: false },
    ]);
  }

  function remove(index: number) {
    keys.current = keys.current.filter((_, i) => i !== index);
    setRows((current) => current.filter((_, i) => i !== index));
  }

  // Sorted, because the ladder is read in order and a person adding a
  // rung in the middle should not have to care. `escalationsToJson` is
  // the one place that knows the stored key names.
  const payload = JSON.stringify(
    escalationsToJson(rows.slice().sort((a, b) => a.atHours - b.atHours)),
  );

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name={name} value={rows.length === 0 ? "" : payload} />

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing happens when this target is missed, beyond the lead showing up under{" "}
          <strong>At risk</strong> on the dashboard. Add a step to have somebody told.
        </p>
      )}

      {rows.map((row, index) => (
        <div
          key={keys.current[index] ?? index}
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border p-3 text-sm"
        >
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              value={row.atHours}
              onChange={(event) => update(index, { atHours: Number(event.target.value) })}
              className="h-9 w-20"
              aria-label="Hours past the target"
            />
            <span className="text-muted-foreground">
              {row.atHours === 0
                ? "as soon as it is late"
                : `${describeHours(row.atHours)} late`}
            </span>
          </div>

          <label className="flex items-center gap-2">
            <Checkbox
              checked={row.notifyOwner}
              onCheckedChange={(next) => update(index, { notifyOwner: next === true })}
            />
            Tell the counsellor
          </label>

          <label className="flex items-center gap-2">
            <Checkbox
              checked={row.unassign}
              onCheckedChange={(next) => update(index, { unassign: next === true })}
            />
            Take it off them
          </label>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ml-auto"
            aria-label="Remove this step"
            onClick={() => remove(index)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={add}>
        <Plus className="size-4" />
        Add a step
      </Button>

      {rows.some((row) => row.unassign) && (
        <p className="text-sm text-muted-foreground">
          <strong>Take it off them</strong> returns the lead to the unassigned queue for somebody
          else to pick up. Use it sparingly — a counsellor who loses leads for being late learns
          to stop logging calls, not to make them.
        </p>
      )}
    </div>
  );
}
