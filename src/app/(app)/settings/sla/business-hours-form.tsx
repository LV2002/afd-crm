"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { saveBusinessHours, type SlaFormState } from "./actions";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface DayHours {
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
}

const initialState: SlaFormState = {};

export function BusinessHoursForm({ centerId, days }: { centerId: string; days: DayHours[] }) {
  const action = saveBusinessHours.bind(null, centerId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-col divide-y rounded-lg border">
        {DAY_NAMES.map((dayName, day) => (
          <div key={day} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <span className="w-24 text-sm font-medium">{dayName}</span>
            <Input
              type="time"
              name={`day.${day}.opens`}
              defaultValue={days[day]?.opensAt ?? "09:00"}
              disabled={days[day]?.isClosed}
              className="w-32"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="time"
              name={`day.${day}.closes`}
              defaultValue={days[day]?.closesAt ?? "18:00"}
              disabled={days[day]?.isClosed}
              className="w-32"
            />
            <div className="ml-auto flex items-center gap-2">
              <Checkbox
                id={`day.${day}.closed`}
                name={`day.${day}.closed`}
                defaultChecked={days[day]?.isClosed ?? false}
              />
              <Label htmlFor={`day.${day}.closed`} className="font-normal">
                Closed
              </Label>
            </div>
          </div>
        ))}
      </div>
      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving..." : "Save business hours"}
      </Button>
    </form>
  );
}
