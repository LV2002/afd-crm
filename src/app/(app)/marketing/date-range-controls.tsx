"use client";

import { RotateCcw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The date range this page reads.
 *
 * Deliberately the only control on the screen. Insights is the place to
 * slice leads twelve ways; this page answers one question — what did the
 * advertising cost and what did it produce — and the only thing anybody
 * changes is the period they are asking about.
 */
export function DateRangeControls({
  from,
  to,
  presets,
}: {
  from: string;
  to: string;
  presets: Array<{ label: string; from: string; to: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function updateParams(changes: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-lg border p-4" aria-busy={isPending}>
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground" htmlFor="spend-from">
          Leads created from
        </Label>
        <Input
          id="spend-from"
          type="date"
          className="h-9 w-40"
          defaultValue={from}
          onChange={(event) => updateParams({ from: event.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground" htmlFor="spend-to">
          to
        </Label>
        <Input
          id="spend-to"
          type="date"
          className="h-9 w-40"
          defaultValue={to}
          onChange={(event) => updateParams({ to: event.target.value })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {presets.map((preset) => (
          <Button
            key={preset.label}
            type="button"
            variant={from === preset.from && to === preset.to ? "secondary" : "outline"}
            size="sm"
            onClick={() => updateParams({ from: preset.from, to: preset.to })}
          >
            {preset.label}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => startTransition(() => router.push(pathname))}
        >
          <RotateCcw className="size-3" /> Reset
        </Button>
      </div>
    </div>
  );
}
