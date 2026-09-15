import { Plus } from "lucide-react";
import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";

import { manageScope } from "./scope";
import type { RuleConditions } from "@/lib/assignment/evaluate-conditions";
import { describeAction, describeConditions, type LabelLookup } from "@/lib/rules/describe-rule";
import { createClient } from "@/lib/supabase/server";

import { loadRuleOptions } from "./load-options";
import { RuleRow, type RuleRowData } from "./rule-row";

export const dynamic = "force-dynamic";

interface RuleRecord {
  id: string;
  name: string;
  priority: number;
  is_active: boolean;
  applies_on: string[];
  conditions: RuleConditions;
  action: Record<string, unknown>;
}

/**
 * Assignment rules, at last with a screen.
 *
 * The engine has been running since Phase 2 — every lead from every
 * ingestion path goes through `applyAssignment()` — but the rules
 * themselves could only be written with an INSERT statement. Which means
 * that in practice there were none, and every lead landed unassigned:
 * exactly the v1 failure CLAUDE.md § 8 was written about.
 *
 * The order of this list *is* the logic. The first rule whose conditions
 * match wins and nothing below it runs, so the arrows are not a display
 * preference.
 */
export default async function AssignmentRulesPage() {
  const user = await getCurrentUser();
  if (!user || manageScope(user) !== "all") return <AccessDenied />;

  const supabase = await createClient();
  const [{ data: rules }, options] = await Promise.all([
    supabase
      .from("assignment_rules")
      .select("id, name, priority, is_active, applies_on, conditions, action")
      .is("deleted_at", null)
      .order("priority")
      .order("created_at")
      .returns<RuleRecord[]>(),
    loadRuleOptions(supabase),
  ]);

  const names = new Map<string, string>();
  for (const center of options.centers) names.set(center.value, center.label);
  for (const person of options.users) names.set(person.value, person.label);
  for (const list of Object.values(options.optionsByField)) {
    for (const option of list) if (!names.has(option.value)) names.set(option.value, option.label);
  }
  const label: LabelLookup = (_kind, value) => names.get(value) ?? value;

  const rows: RuleRowData[] = (rules ?? []).map((rule) => ({
    id: rule.id,
    name: rule.name,
    isActive: rule.is_active,
    appliesOn: rule.applies_on,
    conditions: describeConditions(rule.conditions ?? {}, label),
    assigns: describeAction(rule.action ?? {}, label),
  }));

  const active = rows.filter((row) => row.isActive).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Assignment Rules</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Who gets a new lead, decided automatically. Rules run top to bottom and the first one
            that matches wins — nothing below it is even looked at.
          </p>
        </div>
        <Button asChild>
          <Link href="/settings/rules/new">
            <Plus className="size-4" />
            New rule
          </Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-6">
          <p className="font-medium">No rules yet, so nothing is assigned automatically.</p>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Every lead — from Meta, from the website, from a walk-in — arrives owned by nobody and
            waits in the orphan queue for somebody to notice. One catch-all rule at the bottom that
            shares leads out between the counsellors is enough to stop that happening.
          </p>
        </div>
      ) : (
        <>
          {active === 0 && (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              Every rule here is switched off, so leads are still arriving unassigned.
            </p>
          )}
          <div className="flex flex-col gap-3">
            {rows.map((rule, index) => (
              <RuleRow key={rule.id} rule={rule} position={index} total={rows.length} />
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            A lead that matches no rule at all keeps whoever it already had — usually nobody — and
            shows up in the orphan queue. Ending the list with a catch-all rule (one with no
            conditions) is the way to make sure that never happens.
          </p>
        </>
      )}
    </div>
  );
}
