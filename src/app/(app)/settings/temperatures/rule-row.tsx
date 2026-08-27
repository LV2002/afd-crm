"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import { deleteTemperatureRule, setTemperatureRuleActive } from "./actions";

export interface TemperatureRuleData {
  id: string;
  temperature_value: string;
  priority: number;
  conditions: unknown;
  is_active: boolean;
}

export function RuleRow({ rule }: { rule: TemperatureRuleData }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline">priority {rule.priority}</Badge>
          <span className="text-sm font-medium">→ {rule.temperature_value}</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={rule.is_active}
            disabled={isPending}
            onCheckedChange={(checked) => run(() => setTemperatureRuleActive(rule.id, checked))}
            aria-label="Active"
          />
          <Button
            variant="ghost"
            size="icon"
            disabled={isPending}
            onClick={() => {
              if (!window.confirm("Delete this rule?")) return;
              run(() => deleteTemperatureRule(rule.id));
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
        {JSON.stringify(rule.conditions, null, 2)}
      </pre>
    </div>
  );
}
