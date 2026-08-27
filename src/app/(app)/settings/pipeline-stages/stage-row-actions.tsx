"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import { deleteStage, moveStage, setStageActive } from "./actions";

export function StageRowActions({
  stageId,
  isActive,
  isFirst,
  isLast,
}: {
  stageId: string;
  isActive: boolean;
  isFirst: boolean;
  isLast: boolean;
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
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        disabled={isPending || isFirst}
        onClick={() => run(() => moveStage(stageId, "up"))}
        title="Move up"
      >
        <ArrowUp className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={isPending || isLast}
        onClick={() => run(() => moveStage(stageId, "down"))}
        title="Move down"
      >
        <ArrowDown className="size-4" />
      </Button>
      <Switch
        checked={isActive}
        disabled={isPending}
        onCheckedChange={(checked) => run(() => setStageActive(stageId, checked))}
        aria-label="Active"
      />
      <Button
        variant="ghost"
        size="icon"
        disabled={isPending}
        onClick={() => {
          if (!window.confirm("Delete this stage?")) return;
          run(() => deleteStage(stageId));
        }}
        title="Delete"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}
