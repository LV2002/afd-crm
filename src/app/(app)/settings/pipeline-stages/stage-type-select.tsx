"use client";

import * as React from "react";

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

/**
 * What picking each one actually does.
 *
 * The type was eight words in a dropdown with no stated consequence,
 * which made two of them look decorative when they are the opposite: a
 * stage typed Won is where a confirmed admission sends the lead, and a
 * stage typed Lost or Won takes the lead out of the work queues. An
 * institute that built its pipeline from scratch and left everything as
 * Normal got admissions recorded with the lead still sitting in the
 * funnel, and nothing anywhere said why.
 */
const EFFECTS: Partial<Record<(typeof STAGE_TYPES)[number], string>> = {
  won: "Confirming an admission moves the lead here. Have exactly one.",
  lost: "Asks for a reason, and takes the lead out of the work queues.",
  new: "Where a newly arrived lead starts.",
  scheduled: "Expects a date, and the follow-up queues watch it.",
  parked: "Left out of the day-to-day queues without counting as lost.",
};

function isStageType(value: string): value is (typeof STAGE_TYPES)[number] {
  return (STAGE_TYPES as readonly string[]).includes(value);
}

/**
 * The effect is shown under the control, not inside the options.
 *
 * Putting it in the option looked better and was wrong: this project's
 * `SelectItem` wraps all of its children in Radix's `ItemText`, which is
 * what the closed trigger renders — so every description would have
 * appeared jammed onto the end of the chosen label.
 */
export function StageTypeSelect({ defaultValue }: { defaultValue?: string }) {
  const [value, setValue] = React.useState(
    defaultValue && isStageType(defaultValue) ? defaultValue : "normal",
  );

  return (
    <div className="flex flex-col gap-1.5">
      <Select
        name="stageType"
        value={value}
        onValueChange={(next) => {
          if (isStageType(next)) setValue(next);
        }}
        required
      >
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
      <p className="text-xs text-muted-foreground">
        {EFFECTS[value] ?? "An ordinary step in the funnel. Nothing happens automatically."}
      </p>
    </div>
  );
}
