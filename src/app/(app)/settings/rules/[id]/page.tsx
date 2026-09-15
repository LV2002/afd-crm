import Link from "next/link";
import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/layout/access-denied";
import { getCurrentUser } from "@/lib/auth/session";

import { manageScope } from "../scope";
import type { Condition, RuleConditions } from "@/lib/assignment/evaluate-conditions";
import { createClient } from "@/lib/supabase/server";

import { loadRuleOptions } from "../load-options";
import { RuleForm } from "../rule-form";

export const dynamic = "force-dynamic";

interface RuleRecord {
  id: string;
  name: string;
  is_active: boolean;
  applies_on: string[];
  conditions: RuleConditions | null;
  action: {
    strategy?: string;
    assignTo?: string;
    userIds?: string[];
    centerId?: string;
  } | null;
}

export default async function EditAssignmentRulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || manageScope(user) !== "all") return <AccessDenied />;

  const { id } = await params;
  const supabase = await createClient();

  const [{ data: rule }, options] = await Promise.all([
    supabase
      .from("assignment_rules")
      .select("id, name, is_active, applies_on, conditions, action")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle<RuleRecord>(),
    loadRuleOptions(supabase),
  ]);

  if (!rule) notFound();

  const action = rule.action ?? {};

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/settings/rules" className="text-sm text-muted-foreground hover:underline">
          ← Assignment rules
        </Link>
        <h1 className="text-2xl font-semibold">{rule.name}</h1>
      </div>

      <RuleForm
        ruleId={rule.id}
        values={{
          name: rule.name,
          isActive: rule.is_active,
          appliesOn: rule.applies_on ?? ["create"],
          conditions: (rule.conditions?.all ?? []) as Condition[],
          strategy: action.strategy === "round_robin" ? "round_robin" : "fixed",
          assignTo: action.assignTo ?? "",
          userIds: action.userIds ?? [],
          centerId: action.centerId ?? "",
        }}
        users={options.users}
        centers={options.centers}
        fields={options.fields}
        optionsByField={options.optionsByField}
      />
    </div>
  );
}
