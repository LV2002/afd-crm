"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { dryRunRule } from "@/lib/assignment/apply-assignment";
import { writeAuditLog } from "@/lib/audit/log";
import { getCurrentUser } from "@/lib/auth/session";

import { manageScope } from "./scope";
import { describeAction, describeConditions } from "@/lib/rules/describe-rule";
import { parseAction, parseConditions } from "@/lib/rules/parse-rule";
import { createClient } from "@/lib/supabase/server";

export interface RuleFormState {
  error?: string;
  success?: string;
}

const detailsSchema = z.object({
  name: z.string().trim().min(1, "Give the rule a name you'll recognise in a year."),
  appliesOn: z.array(z.enum(["create", "update"])).min(1, "Pick when this rule runs."),
  isActive: z.boolean(),
});

/**
 * One parse for both create and edit — the two differ only in whether
 * there is an id to write to. Everything a browser posted goes through
 * `parseConditions`/`parseAction` (lib/rules/parse-rule.ts) before it can
 * become JSONB: a bad field name in `conditions` would throw inside
 * `applyAssignment` at ingestion time, which is the worst possible place
 * to find out.
 */
function readForm(formData: FormData) {
  const details = detailsSchema.safeParse({
    name: formData.get("name"),
    appliesOn: formData.getAll("appliesOn").map(String),
    isActive: formData.get("isActive") === "on",
  });
  if (!details.success) return { ok: false as const, error: details.error.issues[0].message };

  const conditions = parseConditions(formData.get("conditions"));
  if (!conditions.ok) return { ok: false as const, error: conditions.error };

  const action = parseAction(
    formData.get("strategy"),
    formData.get("assignTo"),
    formData.getAll("userIds").map(String),
    formData.get("centerId"),
  );
  if (!action.ok) return { ok: false as const, error: action.error };

  return { ok: true as const, details: details.data, conditions: conditions.value, action: action.value };
}

export async function createAssignmentRule(
  _prevState: RuleFormState,
  formData: FormData,
): Promise<RuleFormState> {
  const user = await getCurrentUser();
  if (!user || manageScope(user) !== "all") return { error: "You don't have permission to do that." };

  const parsed = readForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();

  // New rules go last. A rule that silently inserted itself above the
  // existing ones would start catching leads the moment it was saved,
  // which is not what "add a rule" should mean — first match wins.
  const { data: lastRule } = await supabase
    .from("assignment_rules")
    .select("priority")
    .is("deleted_at", null)
    .order("priority", { ascending: false })
    .limit(1)
    .maybeSingle<{ priority: number }>();

  const { data, error } = await supabase
    .from("assignment_rules")
    .insert({
      name: parsed.details.name,
      priority: (lastRule?.priority ?? -1) + 1,
      is_active: parsed.details.isActive,
      conditions: parsed.conditions,
      action: parsed.action,
      applies_on: parsed.details.appliesOn,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "assignment_rule.create",
    entityType: "assignment_rules",
    entityId: data.id,
    // The English, not the JSON: an audit trail nobody can read is a log
    // file, not an audit trail.
    after: {
      name: parsed.details.name,
      conditions: describeConditions(parsed.conditions),
      assigns: describeAction(parsed.action),
      appliesOn: parsed.details.appliesOn,
      isActive: parsed.details.isActive,
    },
  });

  revalidatePath("/settings/rules");
  return { success: "Rule created." };
}

export async function updateAssignmentRule(
  ruleId: string,
  _prevState: RuleFormState,
  formData: FormData,
): Promise<RuleFormState> {
  const user = await getCurrentUser();
  if (!user || manageScope(user) !== "all") return { error: "You don't have permission to do that." };

  const parsed = readForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();

  // Round-robin's rotation position lives inside the action JSONB and is
  // owned by applyAssignment(). Saving the form would otherwise reset it
  // to the top of the list every time, so the first person in the list
  // would quietly get more leads than anybody else.
  const { data: existing } = await supabase
    .from("assignment_rules")
    .select("action")
    .eq("id", ruleId)
    .maybeSingle<{ action: { strategy?: string; cursor?: number } }>();

  const action: Record<string, unknown> = { ...parsed.action };
  if (
    parsed.action.strategy === "round_robin" &&
    existing?.action?.strategy === "round_robin" &&
    typeof existing.action.cursor === "number"
  ) {
    action.cursor = existing.action.cursor;
  }

  const { error } = await supabase
    .from("assignment_rules")
    .update({
      name: parsed.details.name,
      is_active: parsed.details.isActive,
      conditions: parsed.conditions,
      action,
      applies_on: parsed.details.appliesOn,
    })
    .eq("id", ruleId);

  if (error) return { error: error.message };

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "assignment_rule.update",
    entityType: "assignment_rules",
    entityId: ruleId,
    after: {
      name: parsed.details.name,
      conditions: describeConditions(parsed.conditions),
      assigns: describeAction(parsed.action),
      appliesOn: parsed.details.appliesOn,
      isActive: parsed.details.isActive,
    },
  });

  revalidatePath("/settings/rules");
  return { success: "Saved." };
}

export async function setAssignmentRuleActive(ruleId: string, isActive: boolean): Promise<void> {
  const user = await getCurrentUser();
  if (!user || manageScope(user) !== "all") return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("assignment_rules")
    .update({ is_active: isActive })
    .eq("id", ruleId);
  if (error) return;

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: isActive ? "assignment_rule.activate" : "assignment_rule.deactivate",
    entityType: "assignment_rules",
    entityId: ruleId,
  });

  revalidatePath("/settings/rules");
}

/**
 * Soft delete, like every other configuration row here (CLAUDE.md § 5,
 * nothing is hard-deleted). It matters more than usual for this table:
 * `assignment_history.rule_id` points at it, and a hard delete would blank
 * the reason every lead this rule ever assigned was assigned that way.
 */
export async function deleteAssignmentRule(ruleId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user || manageScope(user) !== "all") return { error: "You don't have permission to do that." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("assignment_rules")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", ruleId);
  if (error) return { error: error.message };

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "assignment_rule.delete",
    entityType: "assignment_rules",
    entityId: ruleId,
  });

  revalidatePath("/settings/rules");
  return {};
}

/**
 * Order is the whole semantics of this table — the first matching rule
 * wins and the rest never run — so moving a rule is a real operation and
 * not a display preference.
 *
 * Rewrites every priority as 0..n-1 rather than swapping two numbers:
 * rules seeded or imported with duplicate or sparse priorities are common,
 * and a swap between two rules that both sit at priority 0 does nothing at
 * all, which looks like a broken button.
 */
export async function moveAssignmentRule(
  ruleId: string,
  direction: "up" | "down",
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user || manageScope(user) !== "all") return { error: "You don't have permission to do that." };

  const supabase = await createClient();
  const { data: rules, error } = await supabase
    .from("assignment_rules")
    .select("id, priority, created_at")
    .is("deleted_at", null)
    .order("priority")
    .order("created_at")
    .returns<Array<{ id: string; priority: number; created_at: string }>>();

  if (error) return { error: error.message };
  const ordered = rules ?? [];

  const index = ordered.findIndex((rule) => rule.id === ruleId);
  if (index === -1) return { error: "That rule no longer exists." };

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ordered.length) return {};

  const reordered = [...ordered];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

  for (const [position, rule] of reordered.entries()) {
    if (rule.priority === position) continue;
    const { error: writeError } = await supabase
      .from("assignment_rules")
      .update({ priority: position })
      .eq("id", rule.id);
    if (writeError) return { error: writeError.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "assignment_rule.reorder",
    entityType: "assignment_rules",
    entityId: ruleId,
    after: { order: reordered.map((rule) => rule.id) },
  });

  revalidatePath("/settings/rules");
  return {};
}

/**
 * "This rule would have matched 43 of the last 200 leads" — the data model
 * spec asked for it and nothing called it until now.
 *
 * `dryRunRule` reads through the direct client and so bypasses RLS. That
 * is acceptable here and nowhere else on this screen: it returns two
 * integers and no rows, and the caller must hold `rules.manage`, which is
 * the permission to rewrite how every lead in the institute is assigned —
 * a count of recent leads tells such a person nothing they cannot already
 * see on the dashboard.
 */
export async function previewAssignmentRule(
  conditionsJson: string,
): Promise<{ matched?: number; sampled?: number; error?: string }> {
  const user = await getCurrentUser();
  if (!user || manageScope(user) !== "all") return { error: "You don't have permission to do that." };

  const parsed = parseConditions(conditionsJson);
  if (!parsed.ok) return { error: parsed.error };

  const result = await dryRunRule(parsed.value);
  return { matched: result.matched, sampled: result.sampled };
}
