"use client";

import { Check, Loader2, Lock } from "lucide-react";
import { useState, useTransition } from "react";

import { LostReasonDialog, type LostReasonOption } from "@/components/leads/lost-reason-dialog";
import { Badge } from "@/components/ui/badge";
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
 * ## Every status is a button
 *
 * Leon: "all of these should be other temperature buttons which you can
 * click" — Future prospect, Negative, Wrong target, AFD India student and
 * Joined competitor sit beside Hot and Cold, not behind a menu. They are all
 * the same kind of thing: where this lead is with us. Closing ones that ask
 * why (Negative, Joined competitor) pop the reason dialog first.
 *
 * ## "Took admission" is shown and cannot be clicked
 *
 * It is the one button that is not a choice. It lights up by itself when the
 * admission is confirmed in the panel below, so a counsellor marks the
 * admission once, in one place, and never has to come back up here. The
 * server and the database refuse it from any other route too; this is the
 * version of the refusal that explains itself.
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
  // A retired value the lead still carries stays visible, as a selected button.
  const current = options.find((option) => option.value === temperature) ?? null;
  const shown = current && !current.isActive ? [...offered, current] : offered;

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
            {shown.map((option) => {
              const isCurrent = temperature === option.value;
              // Only the admission confirmation can set this one.
              const automatic = option.kind === "won";
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={pending || automatic}
                  aria-pressed={isCurrent}
                  title={automatic ? "Set automatically when you confirm the admission below" : undefined}
                  onClick={() => choose(option.value)}
                  className={cn(
                    "flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium transition-colors disabled:opacity-60",
                    isCurrent
                      ? "border-transparent bg-primary-subtle text-primary-ink"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    automatic && "border-dashed",
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
                  {automatic && <Lock className="size-3" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
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
