"use client";

import { Check, Loader2 } from "lucide-react";
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
import { cn } from "@/lib/utils";

import { moveLeadStage } from "@/app/(app)/pipeline/actions";
import { setLeadTemperature } from "@/app/(app)/leads/[id]/actions";

export interface StatusBarStage {
  id: string;
  name: string;
  color: string | null;
  requiresReason: boolean;
}

export interface StatusBarTemperature {
  value: string;
  label: string;
  color: string | null;
}

/**
 * Stage and temperature, at the top of a lead, both changeable in one tap.
 *
 * They were two read-only badges. Changing either meant the kanban board
 * (stage) or opening the edit form and finding one dropdown among thirty
 * (temperature) — so during a call, when both are actually known, neither
 * got updated. A counsellor hangs up knowing this lead went cold and the
 * CRM keeps saying Warm until a cron eventually guesses.
 *
 * ## Two controls, never one
 *
 * CLAUDE.md non-negotiable #1: stage is funnel position, temperature is a
 * separate dimension, and neither is derived from the other. A lead can be
 * Hot at Demo Scheduled and Cold at Payment Pending, and both are
 * ordinary. So this is deliberately not a single "status" picker, however
 * much tidier that would look — the shape of the control is the shape of
 * the data.
 *
 * Temperature is buttons and stage is a select because of how many there
 * are: four temperatures a thumb can hit, fourteen stages that would be a
 * wall of buttons.
 *
 * ## Saving
 *
 * Each control saves on change, with no Save button, because a two-field
 * form with a submit is the friction this replaces. The write is
 * optimistic in appearance only: the control shows the new value while the
 * action runs, and puts back the old one if the server refuses.
 */
export function LeadStatusBar({
  leadId,
  stages,
  temperatures,
  currentStageId,
  currentTemperature,
  lostReasonOptions,
  canEdit,
}: {
  leadId: string;
  stages: StatusBarStage[];
  temperatures: StatusBarTemperature[];
  currentStageId: string | null;
  currentTemperature: string | null;
  lostReasonOptions: LostReasonOption[];
  canEdit: boolean;
}) {
  const [stageId, setStageId] = useState(currentStageId);
  const [temperature, setTemperature] = useState(currentTemperature);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const [askingReasonFor, setAskingReasonFor] = useState<string | null>(null);

  function flashSaved() {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  }

  function commitStage(nextStageId: string, reason?: { lostReason?: string; lostReasonDetail?: string }) {
    const previous = stageId;
    setStageId(nextStageId);
    setError(null);
    startTransition(async () => {
      const result = await moveLeadStage(leadId, nextStageId, reason);
      if (result.error) {
        // Put it back. A control that keeps showing the value the server
        // rejected is worse than one that never moved.
        setStageId(previous);
        setError(result.error);
      } else {
        flashSaved();
      }
    });
  }

  function chooseStage(nextStageId: string) {
    const stage = stages.find((candidate) => candidate.id === nextStageId);
    if (!stage) return;
    // Ask before moving, not after being refused: the server would reject
    // this and the counsellor would have watched the select change and
    // change back for no stated reason.
    if (stage.requiresReason) {
      setAskingReasonFor(nextStageId);
      return;
    }
    commitStage(nextStageId);
  }

  function chooseTemperature(value: string) {
    // Pressing the one you are already on clears it, which is the only way
    // back to "let the rules decide" without an extra control.
    const next = temperature === value ? null : value;
    const previous = temperature;
    setTemperature(next);
    setError(null);
    startTransition(async () => {
      const result = await setLeadTemperature(leadId, next);
      if (result.error) {
        setTemperature(previous);
        setError(result.error);
      } else {
        flashSaved();
      }
    });
  }

  const currentStage = stages.find((stage) => stage.id === stageId) ?? null;

  if (!canEdit) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {currentStage && <Badge variant="secondary">{currentStage.name}</Badge>}
        {temperature && (
          <Badge variant="outline">
            {temperatures.find((t) => t.value === temperature)?.label ?? temperature}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Stage
          </span>
          <Select value={stageId ?? ""} onValueChange={chooseStage} disabled={pending}>
            <SelectTrigger className="h-9 w-[13.5rem] max-w-full">
              <SelectValue placeholder="Not in the pipeline" />
            </SelectTrigger>
            <SelectContent>
              {stages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  {stage.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Temperature
          </span>
          <div className="flex flex-wrap gap-1">
            {temperatures.map((option) => {
              const isCurrent = temperature === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={pending}
                  aria-pressed={isCurrent}
                  onClick={() => chooseTemperature(option.value)}
                  className={cn(
                    "flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium transition-colors disabled:opacity-60",
                    isCurrent
                      ? "border-transparent bg-primary/10 text-primary"
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
          if (target) commitStage(target, reason);
        }}
      />
    </div>
  );
}
