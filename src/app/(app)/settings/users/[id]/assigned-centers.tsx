"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Switch } from "@/components/ui/switch";
import { setUserCenterAssignment } from "../../centers/actions";

export interface CenterRow {
  id: string;
  name: string;
  assigned: boolean;
}

export function AssignedCenters({ userId, centers }: { userId: string; centers: CenterRow[] }) {
  const [rows, setRows] = useState(centers);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function toggle(centerId: string, next: boolean) {
    setRows((prev) => prev.map((r) => (r.id === centerId ? { ...r, assigned: next } : r)));
    startTransition(async () => {
      await setUserCenterAssignment(userId, centerId, next);
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No centres yet.</p>;
  }

  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center justify-between gap-4 px-4 py-3">
          <p className="text-sm font-medium">{row.name}</p>
          <Switch
            checked={row.assigned}
            disabled={isPending}
            onCheckedChange={(checked) => toggle(row.id, checked)}
          />
        </li>
      ))}
    </ul>
  );
}
