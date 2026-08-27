"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Switch } from "@/components/ui/switch";
import { setUserCenterAssignment } from "../actions";

export interface UserRow {
  id: string;
  fullName: string;
  email: string;
  assigned: boolean;
}

export function AssignedUsers({ centerId, users }: { centerId: string; users: UserRow[] }) {
  const [rows, setRows] = useState(users);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function toggle(userId: string, next: boolean) {
    setRows((prev) => prev.map((r) => (r.id === userId ? { ...r, assigned: next } : r)));
    startTransition(async () => {
      await setUserCenterAssignment(userId, centerId, next);
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No users yet.</p>;
  }

  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center justify-between gap-4 px-4 py-3">
          <div>
            <p className="text-sm font-medium">{row.fullName}</p>
            <p className="text-xs text-muted-foreground">{row.email}</p>
          </div>
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
