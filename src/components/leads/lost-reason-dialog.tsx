"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export interface LostReasonOption {
  value: string;
  label: string;
}

/**
 * The reason a lead is lost, asked for at the moment it becomes one.
 *
 * Shared rather than copied: a stage with `requires_reason` can be
 * entered from the kanban board and from the status bar on a lead's own
 * page, and the two must ask the same question. The database trigger
 * (`enforce_lost_reason`, migration 0012) is the backstop either way;
 * this exists so the counsellor gets a question instead of an error.
 */
export function LostReasonDialog({
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
          <DialogDescription>
            A reason is required before this lead can move to this stage.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Combobox
            value={lostReason}
            onChange={setLostReason}
            options={options}
            placeholder="Select a reason"
            searchPlaceholder="Type a reason…"
          />
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
          <Button
            disabled={!lostReason}
            onClick={() => onConfirm({ lostReason, lostReasonDetail })}
          >
            Move to Lost
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
