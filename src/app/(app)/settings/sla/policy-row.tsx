"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { MEASURE_COPY, describeHours } from "@/lib/sla/policy-copy";

import { deleteSlaPolicy, setSlaPolicyActive } from "./actions";

/**
 * The stored enum is `first_response`; nobody calls it that out loud.
 *
 * `MEASURE_COPY` is the same table the form reads, so a policy reads the
 * same way on the list as it did on the screen that created it. A measure
 * this file has not heard of falls back to the raw value rather than
 * rendering nothing — a policy the sweep is acting on must stay visible
 * even if somebody adds a measure and forgets this table.
 */
function measureLabel(measure: string): string {
  return MEASURE_COPY[measure as keyof typeof MEASURE_COPY]?.label ?? measure;
}

export interface SlaPolicyData {
  id: string;
  name: string;
  priority: number;
  measure: string;
  target_hours: number;
  business_hours_only: boolean;
  is_active: boolean;
  /** Both already turned into English on the server. */
  applies_to: string;
  escalations: string;
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
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-lg border p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{policy.name}</p>
        <p className="text-xs text-muted-foreground">
          {measureLabel(policy.measure)} within {describeHours(policy.target_hours)}
          {policy.business_hours_only ? " of working time" : ""} · {policy.applies_to}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{policy.escalations}</p>
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
