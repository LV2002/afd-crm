"use client";

import { useEffect, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { maskPhone } from "@/lib/leads/mask-phone";

import { moveLeadStage } from "./actions";

export interface KanbanStage {
  id: string;
  name: string;
  color: string | null;
  requiresReason: boolean;
}

export interface KanbanLead {
  id: string;
  leadNumber: number;
  studentName: string;
  primaryPhone: string;
  stageId: string | null;
  temperature: string | null;
  centerName: string | null;
  assignedToName: string | null;
  lostReasonLabel: string | null;
}

interface LostReasonOption {
  value: string;
  label: string;
}

/** A synthetic column id for leads with no stage_id — never hide a lead just because it fell outside the pipeline configuration. */
const UNSTAGED = "__unstaged__";

export function KanbanBoard({
  stages,
  initialLeads,
  lostReasonOptions,
  canMove,
}: {
  stages: KanbanStage[];
  initialLeads: KanbanLead[];
  lostReasonOptions: LostReasonOption[];
  canMove: boolean;
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [pendingReasonMove, setPendingReasonMove] = useState<{ leadId: string; stageId: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Re-sync when the server component re-renders with fresh data (e.g.
  // after revalidatePath() from a successful move, or another user's
  // change on next navigation) — the RSC props are the source of truth,
  // local state is only for optimistic drag feedback in between.
  useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

  function commitMove(leadId: string, stageId: string, reason?: { lostReason: string; lostReasonDetail: string }) {
    const previous = leads;
    setLeads((cur) => cur.map((l) => (l.id === leadId ? { ...l, stageId } : l)));
    setError(null);

    startTransition(async () => {
      const result = await moveLeadStage(leadId, stageId, reason);
      if (result.error) {
        setLeads(previous);
        setError(result.error);
      }
    });
  }

  function handleDrop(stage: KanbanStage) {
    setDragOverStageId(null);
    if (!canMove || !draggingId) return;
    const lead = leads.find((l) => l.id === draggingId);
    setDraggingId(null);
    if (!lead || lead.stageId === stage.id) return;

    if (stage.requiresReason) {
      setPendingReasonMove({ leadId: lead.id, stageId: stage.id });
      return;
    }
    commitMove(lead.id, stage.id);
  }

  const columns: Array<KanbanStage | { id: string; name: string; color: null; requiresReason: false }> = [
    ...stages,
    ...(leads.some((l) => !l.stageId)
      ? [{ id: UNSTAGED, name: "No stage", color: null, requiresReason: false as const }]
      : []),
  ];

  return (
    <div className="flex flex-1 flex-col gap-3">
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
        {columns.map((stage) => {
          const stageLeads = leads.filter((l) => (l.stageId ?? UNSTAGED) === stage.id);
          return (
            <div
              key={stage.id}
              onDragOver={(e) => {
                if (!canMove) return;
                e.preventDefault();
                setDragOverStageId(stage.id);
              }}
              onDragLeave={() => setDragOverStageId((cur) => (cur === stage.id ? null : cur))}
              onDrop={() => handleDrop(stage as KanbanStage)}
              className={`flex w-72 shrink-0 flex-col gap-2 rounded-lg border bg-muted/30 p-2 ${
                dragOverStageId === stage.id ? "ring-2 ring-ring" : ""
              }`}
            >
              <div className="flex items-center gap-2 px-1 py-1">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: stage.color ?? "#94a3b8" }}
                />
                <span className="text-sm font-medium">{stage.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{stageLeads.length}</span>
              </div>

              <div className="flex flex-col gap-2">
                {stageLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    canMove={canMove}
                    onDragStart={() => setDraggingId(lead.id)}
                    onDragEnd={() => setDraggingId(null)}
                  />
                ))}
                {stageLeads.length === 0 && (
                  <p className="px-1 py-2 text-center text-xs text-muted-foreground">No leads</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <LostReasonDialog
        open={pendingReasonMove !== null}
        options={lostReasonOptions}
        onCancel={() => setPendingReasonMove(null)}
        onConfirm={(reason) => {
          if (!pendingReasonMove) return;
          commitMove(pendingReasonMove.leadId, pendingReasonMove.stageId, reason);
          setPendingReasonMove(null);
        }}
      />
    </div>
  );
}

function LeadCard({
  lead,
  canMove,
  onDragStart,
  onDragEnd,
}: {
  lead: KanbanLead;
  canMove: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <a
      href={`/leads/${lead.id}`}
      draggable={canMove}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`flex flex-col gap-1.5 rounded-md border bg-background p-2.5 text-sm shadow-sm transition-shadow hover:shadow ${
        canMove ? "cursor-grab active:cursor-grabbing" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{lead.studentName}</span>
        <span className="text-xs text-muted-foreground">#{lead.leadNumber}</span>
      </div>
      {/* Non-negotiable #6: masked in list/bulk views. This card never
          reveals — that's an audited action on the lead detail page only. */}
      <span className="font-mono text-xs text-muted-foreground">{maskPhone(lead.primaryPhone)}</span>
      <div className="flex flex-wrap gap-1">
        {lead.temperature && (
          <Badge variant="outline" className="text-xs">
            {lead.temperature}
          </Badge>
        )}
        {lead.centerName && (
          <Badge variant="outline" className="text-xs">
            {lead.centerName}
          </Badge>
        )}
      </div>
      {/* Only leads currently sitting in a requires_reason stage (Lost)
          carry a lost_reason at all — enforce_lost_reason clears it the
          moment a lead moves anywhere else, so this only ever shows up in
          the Lost column, which is exactly where it's useful at a glance. */}
      {lead.lostReasonLabel && (
        <Badge variant="destructive" className="w-fit text-xs">
          {lead.lostReasonLabel}
        </Badge>
      )}
      {lead.assignedToName && (
        <span className="text-xs text-muted-foreground">{lead.assignedToName}</span>
      )}
    </a>
  );
}

function LostReasonDialog({
  open,
  options,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  options: LostReasonOption[];
  onCancel: () => void;
  onConfirm: (reason: { lostReason: string; lostReasonDetail: string }) => void;
}) {
  const [lostReason, setLostReason] = useState("");
  const [lostReasonDetail, setLostReasonDetail] = useState("");

  useEffect(() => {
    if (!open) {
      setLostReason("");
      setLostReasonDetail("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Why is this lead lost?</DialogTitle>
          <DialogDescription>A reason is required before this lead can move to this stage.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Select value={lostReason} onValueChange={setLostReason}>
            <SelectTrigger>
              <SelectValue placeholder="Select a reason" />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Additional detail (optional)"
            value={lostReasonDetail}
            onChange={(e) => setLostReasonDetail(e.target.value)}
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={!lostReason} onClick={() => onConfirm({ lostReason, lostReasonDetail })}>
            Move to Lost
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
