"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { indexByValue } from "@/lib/leads/temperature-kinds";
import { loadTemperatureOptions } from "@/lib/leads/temperature-options";
import { createClient } from "@/lib/supabase/server";

export interface RuleFormState {
  error?: string;
  success?: string;
}

const ruleSchema = z.object({
  temperatureValue: z.string().trim().min(1, "Pick a temperature value"),
  priority: z.coerce.number().int().min(0),
  conditions: z.string().trim().min(1, "Conditions are required"),
});

function parseConditions(raw: string): { ok: true; value: Record<string, unknown> } | { ok: false } {
  try {
    const value = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: false };
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

export async function createTemperatureRule(
  _prevState: RuleFormState,
  formData: FormData,
): Promise<RuleFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "rules.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const parsed = ruleSchema.safeParse({
    temperatureValue: formData.get("temperatureValue"),
    priority: formData.get("priority") || 0,
    conditions: formData.get("conditions"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const conditions = parseConditions(parsed.data.conditions);
  if (!conditions.ok) {
    return { error: 'Conditions must be a JSON object, e.g. {"all":[]}' };
  }

  const supabase = await createClient();

  /*
    A rule may only set a temperature that means "being worked".

    The nightly job applies these to leads on its own, and it cannot do
    what a person can: it cannot confirm an admission (so it cannot set
    Took admission), and it cannot say why a lead is closed (so it cannot
    set Negative). The recompute ignores such a rule rather than failing,
    but an admin who writes one deserves to be told now, not to wonder
    for a month why it never fires.
  */
  const target = indexByValue(await loadTemperatureOptions(supabase)).get(parsed.data.temperatureValue);
  if (!target || target.kind !== "open") {
    return {
      error:
        "A rule can only set a temperature that means a lead is being worked — such as Contacted, Cold, Warm or Hot. Closing a lead, or marking an admission, is done by a person.",
    };
  }

  const { data, error } = await supabase
    .from("temperature_rules")
    .insert({
      temperature_value: parsed.data.temperatureValue,
      priority: parsed.data.priority,
      conditions: conditions.value,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "temperature_rule.create",
    entityType: "temperature_rules",
    entityId: data.id,
    after: parsed.data,
  });

  revalidatePath("/settings/temperatures");
  return { success: "Rule created." };
}

export async function deleteTemperatureRule(ruleId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user || !can(user, "rules.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("temperature_rules").delete().eq("id", ruleId);
  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "temperature_rule.delete",
    entityType: "temperature_rules",
    entityId: ruleId,
  });

  revalidatePath("/settings/temperatures");
  return {};
}

export async function setTemperatureRuleActive(ruleId: string, isActive: boolean): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !can(user, "rules.manage")) return;

  const supabase = await createClient();
  const { error } = await supabase.from("temperature_rules").update({ is_active: isActive }).eq("id", ruleId);
  if (error) return;

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: isActive ? "temperature_rule.activate" : "temperature_rule.deactivate",
    entityType: "temperature_rules",
    entityId: ruleId,
  });

  revalidatePath("/settings/temperatures");
}
