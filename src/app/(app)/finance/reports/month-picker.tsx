"use client";

import { useRouter } from "next/navigation";

import { Label } from "@/components/ui/label";

/**
 * Month selector for the monthly report.
 *
 * A native `<input type="month">` rather than two dropdowns: it is one
 * control, it validates itself, and on a phone it opens the OS month
 * picker — which matters, because the person running this report is often
 * doing it from the centre rather than a desk.
 */
export function MonthPicker({ monthKey }: { monthKey: string }) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="month">Month</Label>
        <input
          id="month"
          type="month"
          value={monthKey}
          onChange={(e) => {
            if (e.target.value) router.push(`/finance/reports?month=${e.target.value}`);
          }}
          className="h-9 rounded-md border bg-transparent px-3 text-sm"
        />
      </div>
    </div>
  );
}
