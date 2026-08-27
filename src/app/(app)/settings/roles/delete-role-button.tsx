"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { deleteRole } from "./actions";

export function DeleteRoleButton({ roleId, isProtected }: { roleId: string; isProtected: boolean }) {
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (isProtected) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => {
          if (!window.confirm("Delete this role? Users holding it must be reassigned first.")) return;
          startTransition(async () => {
            const result = await deleteRole(roleId);
            if (result.error) {
              setError(result.error);
            } else {
              router.push("/settings/roles");
            }
          });
        }}
      >
        <Trash2 /> Delete role
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
