"use client";

import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import { deleteAssignmentRule, moveAssignmentRule, setAssignmentRuleActive } from "./actions";

export interface RuleRowData {
  id: string;
  name: string;
  isActive: boolean;
  appliesOn: string[];
  /** Already turned into English on the server — see lib/rules/describe-rule.ts. */
  conditions: string;
  assigns: string;
}

export function RuleRow({
  rule,
  position,
  total,
}: {
  rule: RuleRowData;
  position: number;
  total: number;
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
    <div className={rule.isActive ? "flex flex-col gap-3 rounded-lg border bg-card p-4" : "flex flex-col gap-3 rounded-lg border border-dashed bg-muted/40 p-4"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex shrink-0 flex-col">
            <button
              type="button"
              onClick={() => run(() => moveAssignmentRule(rule.id, "up"))}
              disabled={isPending || position === 0}
              aria-label="Move up"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
            >
              <ArrowUp className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => run(() => moveAssignmentRule(rule.id, "down"))}
              disabled={isPending || position === total - 1}
              aria-label="Move down"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
            >
              <ArrowDown className="size-4" />
            </button>
          </div>

          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              <span className="text-xs text-muted-foreground">#{position + 1}</span>
              {rule.name}
              {!rule.isActive && <Badge variant="outline">Off</Badge>}
            </p>
            <p className="text-sm text-muted-foreground">{rule.conditions}</p>
            <p className="text-sm">{rule.assigns}</p>
            <p className="text-xs text-muted-foreground">
              Runs when a lead is {rule.appliesOn.join(" or ")}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Switch
            checked={rule.isActive}
            disabled={isPending}
            onCheckedChange={(checked) => run(() => setAssignmentRuleActive(rule.id, checked))}
            aria-label={rule.isActive ? "Turn this rule off" : "Turn this rule on"}
          />
          <Button asChild variant="ghost" size="icon">
            <Link href={`/settings/rules/${rule.id}`} aria-label={`Edit ${rule.name}`}>
              <Pencil className="size-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={isPending}
            aria-label={`Delete ${rule.name}`}
            onClick={() => {
              if (!window.confirm(`Delete "${rule.name}"? Leads it already assigned keep their history.`)) return;
              run(() => deleteAssignmentRule(rule.id));
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
