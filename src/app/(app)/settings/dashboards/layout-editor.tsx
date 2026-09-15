"use client";

import { ArrowDown, ArrowUp, RotateCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import { resetDashboardLayout, saveDashboardLayout, type DashboardFormState } from "./actions";

const initialState: DashboardFormState = {};

export interface EditorWidget {
  key: string;
  name: string;
  description: string;
  /** False when the role lacks the permission the widget's data needs. */
  allowed: boolean;
  /** Why it is unavailable, in words — the permission code means nothing to Leon. */
  blockedReason?: string;
  visible: boolean;
}

/**
 * Arranging one role's dashboard.
 *
 * Widgets the role cannot see are listed too, greyed out and with the
 * reason. Hiding them entirely would make the screen lie by omission —
 * "why can't I give accounts the pipeline card?" has an answer, and it is
 * "they cannot read leads", which belongs on the screen rather than in
 * somebody's head.
 */
export function LayoutEditor({
  roleId,
  roleName,
  widgets,
  arranged,
}: {
  roleId: string;
  roleName: string;
  widgets: EditorWidget[];
  /** False when this role has no saved rows — it is following its permissions. */
  arranged: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveDashboardLayout, initialState);
  const [rows, setRows] = React.useState(widgets);
  const [resetting, startReset] = React.useTransition();
  const router = useRouter();

  React.useEffect(() => setRows(widgets), [widgets]);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="roleId" value={roleId} />

      <div className="flex flex-col gap-2">
        {rows.map((widget, index) => (
          <div
            key={widget.key}
            className={
              widget.allowed
                ? "flex items-start gap-3 rounded-lg border bg-card p-3"
                : "flex items-start gap-3 rounded-lg border border-dashed bg-muted/40 p-3"
            }
          >
            <input type="hidden" name="order" value={widget.key} />
            {widget.visible && widget.allowed && (
              <input type="hidden" name="visible" value={widget.key} />
            )}

            <div className="flex shrink-0 flex-col">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={`Move ${widget.name} up`}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
              >
                <ArrowUp className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === rows.length - 1}
                aria-label={`Move ${widget.name} down`}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
              >
                <ArrowDown className="size-4" />
              </button>
            </div>

            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {widget.name}
                {!widget.allowed && <Badge variant="outline">Not available</Badge>}
              </p>
              <p className="text-sm text-muted-foreground">{widget.description}</p>
              {!widget.allowed && widget.blockedReason && (
                <p className="text-xs text-muted-foreground">{widget.blockedReason}</p>
              )}
            </div>

            <Switch
              checked={widget.allowed && widget.visible}
              disabled={!widget.allowed}
              onCheckedChange={(checked) =>
                setRows((current) =>
                  current.map((row) => (row.key === widget.key ? { ...row, visible: checked } : row)),
                )
              }
              aria-label={`Show ${widget.name} to ${roleName}`}
            />
          </div>
        ))}
      </div>

      <FormMessage error={state.error} success={state.success} />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          <Save className="size-4" />
          {pending ? "Saving…" : "Save arrangement"}
        </Button>
        {arranged && (
          <Button
            type="button"
            variant="outline"
            disabled={resetting}
            onClick={() =>
              startReset(async () => {
                await resetDashboardLayout(roleId);
                router.refresh();
              })
            }
          >
            <RotateCcw className="size-4" />
            Back to the default
          </Button>
        )}
        <p className="text-sm text-muted-foreground">
          {arranged
            ? `${roleName} sees exactly what is switched on here.`
            : `${roleName} has never been arranged — they see every widget their permissions allow.`}
        </p>
      </div>
    </form>
  );
}
