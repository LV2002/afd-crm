"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { STAGE_TYPES } from "./constants";

const LABELS: Record<(typeof STAGE_TYPES)[number], string> = {
  new: "New",
  normal: "Normal",
  scheduled: "Scheduled",
  enrolment_form: "Enrolment form",
  payment: "Payment",
  won: "Won",
  lost: "Lost",
  parked: "Parked",
};

export function StageTypeSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <Select name="stageType" defaultValue={defaultValue ?? "normal"} required>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STAGE_TYPES.map((type) => (
          <SelectItem key={type} value={type}>
            {LABELS[type]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
