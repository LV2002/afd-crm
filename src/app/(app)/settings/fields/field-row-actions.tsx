"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import { deleteField, setFieldActive } from "./actions";

export function FieldRowActions({
  fieldId,
  isActive,
  isCore,
}: {
  fieldId: string;
  isActive: boolean;
  isCore: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Switch
        checked={isActive}
        disabled={isPending}
        onCheckedChange={(checked) => run(() => setFieldActive(fieldId, checked))}
        aria-label="Active"
      />
      {!isCore && (
        <Button
          variant="ghost"
          size="icon"
          disabled={isPending}
          onClick={() => {
            if (!window.confirm("Delete this field?")) return;
            run(() => deleteField(fieldId));
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );
}
