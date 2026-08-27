"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { createHoliday, deleteHoliday, type SlaFormState } from "./actions";

export interface HolidayData {
  id: string;
  date: string;
  name: string;
}

const initialState: SlaFormState = {};

export function HolidaysList({ centerId, holidays }: { centerId: string; holidays: HolidayData[] }) {
  const action = createHoliday.bind(null, centerId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-2">
      {holidays.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-lg border">
          {holidays.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-4 px-3 py-2">
              <span className="text-sm">
                {h.date} — {h.name}
              </span>
              <Button
                variant="ghost"
                size="icon"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await deleteHoliday(h.id);
                    router.refresh();
                  })
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No holidays yet.</p>
      )}
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <Input type="date" name="date" required className="w-40" />
        <Input name="name" placeholder="Onam" required className="w-40" />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Adding..." : "Add holiday"}
        </Button>
        <FormMessage error={state.error} success={state.success} />
      </form>
    </div>
  );
}
