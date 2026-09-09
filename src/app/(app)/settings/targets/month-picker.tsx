"use client";

import { useRouter } from "next/navigation";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/**
 * Which month is being set.
 *
 * A native month input rather than two dropdowns: it is one tap on a
 * phone, it cannot produce the 31st of February, and it is the control
 * everybody already knows from every other form they have filled in.
 */
export function MonthPicker({ month }: { month: string }) {
  const router = useRouter();

  return (
    <div className="max-w-xs">
      <Field label="Month" htmlFor="targets-month" hint="Targets are set one month at a time.">
        <Input
          id="targets-month"
          type="month"
          defaultValue={month}
          onChange={(event) => {
            const value = event.target.value;
            if (/^\d{4}-\d{2}$/.test(value)) router.push(`/settings/targets?month=${value}`);
          }}
        />
      </Field>
    </div>
  );
}
