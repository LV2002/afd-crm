"use client";

import { Check, Loader2, Lock } from "lucide-react";
import { useState, useTransition } from "react";

import { LostReasonDialog, type LostReasonOption } from "@/components/leads/lost-reason-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TemperatureOption } from "@/lib/leads/temperature-kinds";
import { cn } from "@/lib/utils";

import { setLeadTemperature } from "@/app/(app)/leads/[id]/actions";

/**
 * A lead's whole status, at the top of the page, changeable in one tap.
 *
 * ## One control, because it is one thing now
 *
 * This used to be two: a stage select and four temperature buttons, kept
 * apart on purpose because funnel position and warmth were separate
 * dimensions. Leon merged them — "I don't want stages anymore, lets keep
 * it as only temperature" — into eleven values. So the shape of the
 * control follows the shape of the data again.
 *
 * ## Why buttons AND a select
 *
 * What a counsellor changes during a call is warmth: Contacted, Cold,
 * Warm, Hot. Those few are buttons a thumb can hit. How a lead ENDS is a
 * different, rarer act — parked for later, wrong target, joined a
 * competitor — and six more buttons would bury the four that matter, so
 * the endings live in a select.
 *
 * ## "Took admission" is shown and cannot be chosen
 *
 * It sits in the list, disabled, with the reason — so nobody wonders where
 * it went — because the only way to it is to confirm the admission with a
 * course, batch and fee. The server and the database refuse it too; this
 * is the version of the refusal that explains itself.
 *
 * ## Saving
 *
 * Each choice saves on its own, with no Save button, because a one-field
 * form with a submit is the friction this replaces. The write is
 * optimistic in appearance only: the control shows the new value while the
 * action runs, and puts back the old one if the server refuses.
 */
export function LeadStatusBar({
  leadId,
  options,
  currentTemperature,
  admissionStands,
  lostReasonOptions,
  canEdit,
}: {
  leadId: string;
  options: TemperatureOption[];
  currentTemperature: string | null;
  /** A confirmed, undropped admission exists: the status is a fact about it. */
  admissionStands: boolean;
  lostReasonOptions: LostReasonOption[];
  canEdit: boolean;
}) {
  const [temperature, setTemperature] = useState(currentTemperature);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const [askingReasonFor, setAskingReasonFor] = useState<string | null>(null);

  // A retired value (inactive) is still SHOWN when a lead carries it, but
  // never offered.
  const offered = options.filter((option) => option.isActive);
  const working = offered.filter((option) => option.kind === "new" || option.kind === "open");
  const endings = offered.filter((option) => option.kind !== "new" && option.kind !== "open");
  const current = options.find((option) => option.value === temperature) ?? null;
  const currentIsEnding = current !== null && current.kind !== "new" && current.kind !== "open";

  function flashSaved() {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  }

  function commit(
    next: string,
    reason?: { lostReason?: string; lostReasonDetail?: string },
  ) {
    const previous = temperature;
    setTemperature(next);
    setError(null);
    startTransition(async () => {
      const result = await setLeadTemperature(leadId, next, reason);
      if (result.error) {
        // Put it back. A control that keeps showing the value the server
        // rejected is worse than one that never moved.
        setTemperature(previous);
        setError(result.error);
      } else {
        flashSaved();
      }
    });
  }

  function choose(value: string) {
    const option = options.find((candidate) => candidate.value === value);
    if (!option || value === temperature) return;
    // Ask before moving, not after being refused: the server would reject
    // this and the counsellor would have watched the control change and
    // change back for no stated reason.
    if (option.kind === "lost" && option.requiresReason) {
      setAskingReasonFor(value);
      return;
    }
    commit(value);
  }

  if (!canEdit || admissionStands) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Temperature
          </span>
          {current ? (
            <Badge variant={current.kind === "won" ? "success" : "outline"}>{current.label}</Badge>
          ) : (
            <Badge variant="outline">Not set</Badge>
          )}
          {admissionStands && canEdit && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="size-3" aria-hidden="true" />
              The admission is confirmed. To change this, drop the admission from the Accounts screen.
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Temperature
          </span>
          <div className="flex flex-wrap gap-1">
            {working.map((option) => {
              const isCurrent = temperature === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={pending}
                  aria-pressed={isCurrent}
                  onClick={() => choose(option.value)}
                  className={cn(
                    "flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium transition-colors disabled:opacity-60",
                    isCurrent
                      ? "border-transparent bg-primary-subtle text-primary-ink"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {option.color && (
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: option.color }}
                      aria-hidden="true"
                    />
                  )}
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Or
          </span>
          <Select
            value={currentIsEnding ? (temperature ?? "") : ""}
            onValueChange={choose}
            disabled={pending}
          >
            <SelectTrigger
              aria-label="Mark this lead as"
              className={cn(
                "h-9 w-[13.5rem] max-w-full",
                currentIsEnding && "border-transparent bg-primary-subtle text-primary-ink",
              )}
            >
              <SelectValue placeholder="Mark as…" />
            </SelectTrigger>
            <SelectContent>
              {endings.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  // The only route to this one is confirming the admission.
                  disabled={option.kind === "won"}
                >
                  {option.label}
                  {option.kind === "won" ? " — confirm the admission below" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
          {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          {!pending && saved && (
            <>
              <Check className="size-3.5" aria-hidden="true" />
              Saved
            </>
          )}
        </span>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <LostReasonDialog
        open={askingReasonFor !== null}
        options={lostReasonOptions}
        onCancel={() => setAskingReasonFor(null)}
        onConfirm={(reason) => {
          const target = askingReasonFor;
          setAskingReasonFor(null);
          if (target) commit(target, reason);
        }}
      />
    </div>
  );
}
