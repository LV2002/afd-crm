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
 * Shared rather than copied, so every place a lead can be closed asks the
 * same question. The database trigger (`enforce_lead_status`, migration
 * 0099) is the backstop for every other write path; this exists so the
 * counsellor gets a question instead of an error.
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
            A reason is required before this lead can be marked this way.
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
