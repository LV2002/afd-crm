"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUSES = ["active", "on_hold", "completed", "dropped"];

export function StatusFilter({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Select
      value={value || undefined}
      onValueChange={(next) => {
        const params = new URLSearchParams(searchParams.toString());
        if (next) params.set("status", next);
        else params.delete("status");
        router.push(`${pathname}?${params.toString()}`);
      }}
    >
      <SelectTrigger className="h-8 w-40">
        <SelectValue placeholder="Status" />
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {s.replace("_", " ")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
