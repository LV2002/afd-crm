"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Yesterday, today, or a date.
 *
 * Arrows as well as a date field because the real usage is "and the day
 * before that" — a centre head checking a quiet patch walks backwards, and
 * making them retype a date each time is how a screen stops being used.
 *
 * Dates are handled as `YYYY-MM-DD` strings and stepped at UTC noon, which
 * cannot cross a day boundary for a fixed +05:30 offset. Stepping a local
 * Date would land on the previous day for anybody west of Greenwich.
 */
function step(day: string, days: number): string {
  const at = new Date(`${day}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

export function DayPicker({ day, today }: { day: string; today: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function go(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === today) params.delete("day");
    else params.set("day", next);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div className="flex items-center gap-1" aria-busy={isPending}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label="Previous day"
        onClick={() => go(step(day, -1))}
      >
        <ChevronLeft className="size-4" />
      </Button>

      <Input
        type="date"
        value={day}
        max={today}
        className="h-8 w-40"
        aria-label="Show activity for this day"
        onChange={(event) => {
          if (event.target.value) go(event.target.value);
        }}
      />

      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label="Next day"
        // There is no activity in the future, so the arrow stops at today.
        disabled={day >= today}
        onClick={() => go(step(day, 1))}
      >
        <ChevronRight className="size-4" />
      </Button>

      {day !== today ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => go(today)}>
          Today
        </Button>
      ) : null}
    </div>
  );
}
