"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import { deleteSlaPolicy, setSlaPolicyActive } from "./actions";

export interface SlaPolicyData {
  id: string;
  name: string;
  priority: number;
  measure: string;
  target_hours: number;
  business_hours_only: boolean;
  is_active: boolean;
}

export function PolicyRow({ policy }: { policy: SlaPolicyData }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
      <div>
        <p className="text-sm font-medium">{policy.name}</p>
        <p className="text-xs text-muted-foreground">
          {policy.measure} · {policy.target_hours}h
          {policy.business_hours_only ? " · business hours only" : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline">priority {policy.priority}</Badge>
        <Switch
          checked={policy.is_active}
          disabled={isPending}
          onCheckedChange={(checked) => run(() => setSlaPolicyActive(policy.id, checked))}
          aria-label="Active"
        />
        <Button
          variant="ghost"
          size="icon"
          disabled={isPending}
          onClick={() => {
            if (!window.confirm(`Delete "${policy.name}"?`)) return;
            run(() => deleteSlaPolicy(policy.id));
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
