"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { parseConditions } from "@/lib/rules/parse-rule";
import { createClient } from "@/lib/supabase/server";

export interface SlaFormState {
  error?: string;
  success?: string;
}

const MEASURES = ["first_response", "next_followup", "in_stage"] as const;

const policySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  priority: z.coerce.number().int().min(0),
  measure: z.enum(MEASURES),
  targetHours: z.coerce.number().int().positive(),
  businessHoursOnly: z.coerce.boolean().optional(),
  appliesTo: z.string().trim().optional().or(z.literal("")),
  escalations: z.string().trim().optional().or(z.literal("")),
});

/**
 * The escalation ladder, validated rather than merely parsed.
 *
 * `parseEscalationStep` in lib/sla/escalations.ts is deliberately
 * tolerant — it is read inside an hourly cron sweep, where throwing on a
 * mistyped key would abandon every lead after the bad one. That is right
 * for the reader and wrong for the writer: a rung the sweep silently
 * skips is a promise an administrator believes they made and nobody
 * kept. So the write path is strict, and says which rung is wrong.
 *
 * Only the keys the sweep actually reads are accepted. The schema comment
 * on the table once mentioned `flag_breach`, the old form's placeholder
 * taught it, and nothing has ever read it — so a ladder containing it is
 * refused here rather than stored looking like it does something.
 */
const escalationSchema = z
  .array(
    z
      .object({
        at_hours: z.number().int().min(0),
        notify_owner: z.boolean().optional(),
        unassign: z.boolean().optional(),
        notify_roles: z.array(z.string()).optional(),
      })
      .strict(),
  )
  .max(10, "Ten escalation steps is already more than anybody reads.");

export async function createSlaPolicy(
  _prevState: SlaFormState,
  formData: FormData,
): Promise<SlaFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "rules.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const parsed = policySchema.safeParse({
    name: formData.get("name"),
    priority: formData.get("priority") || 0,
    measure: formData.get("measure"),
    targetHours: formData.get("targetHours"),
    businessHoursOnly: formData.get("businessHoursOnly") === "on",
    appliesTo: formData.get("appliesTo"),
    escalations: formData.get("escalations"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  // Same validation the assignment rules use, for the same reason: a
  // condition naming a field the evaluator does not know reaches
  // `evaluateConditions` once per lead inside the hourly sweep, where
  // nobody is watching it throw.
  const appliesTo = parseConditions(parsed.data.appliesTo);
  if (!appliesTo.ok) return { error: appliesTo.error };

  let escalations: Array<Record<string, unknown>> | null = null;
  if (parsed.data.escalations) {
    let raw: unknown;
    try {
      raw = JSON.parse(parsed.data.escalations);
    } catch {
      return { error: "The escalation steps were not valid JSON." };
    }
    const ladder = escalationSchema.safeParse(raw);
    if (!ladder.success) {
      const issue = ladder.error.issues[0];
      // Name the dead key rather than echoing zod. `flag_breach` is the
      // one anybody is likely to have: it was in the old placeholder and
      // nothing has ever read it.
      if (issue?.code === "unrecognized_keys") {
        return {
          error: `An escalation step has a setting this system does not act on: ${issue.keys.join(", ")}. Remove it — a step is only ever "hours past the target", "tell the counsellor" and "take it off them".`,
        };
      }
      return { error: issue?.message ?? "An escalation step is not valid." };
    }
    escalations = ladder.data;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sla_policies")
    .insert({
      name: parsed.data.name,
      priority: parsed.data.priority,
      measure: parsed.data.measure,
      target_hours: parsed.data.targetHours,
      business_hours_only: parsed.data.businessHoursOnly ?? false,
      applies_to: appliesTo.value,
      escalations,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "sla_policy.create",
    entityType: "sla_policies",
    entityId: data.id,
    after: parsed.data,
  });

  revalidatePath("/settings/sla");
  return { success: "Policy created." };
}

export async function deleteSlaPolicy(policyId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user || !can(user, "rules.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("sla_policies").delete().eq("id", policyId);
  if (error) return { error: error.message };

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "sla_policy.delete",
    entityType: "sla_policies",
    entityId: policyId,
  });

  revalidatePath("/settings/sla");
  return {};
}

export async function setSlaPolicyActive(policyId: string, isActive: boolean): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !can(user, "rules.manage")) return;

  const supabase = await createClient();
  const { error } = await supabase.from("sla_policies").update({ is_active: isActive }).eq("id", policyId);
  if (error) return;

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: isActive ? "sla_policy.activate" : "sla_policy.deactivate",
    entityType: "sla_policies",
    entityId: policyId,
  });

  revalidatePath("/settings/sla");
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export async function saveBusinessHours(
  centerId: string,
  _prevState: SlaFormState,
  formData: FormData,
): Promise<SlaFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "rules.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();

  for (let day = 0; day < DAY_NAMES.length; day++) {
    const isClosed = formData.get(`day.${day}.closed`) === "on";
    const opensAt = String(formData.get(`day.${day}.opens`) || "") || null;
    const closesAt = String(formData.get(`day.${day}.closes`) || "") || null;

    const { error } = await supabase.from("business_hours").upsert(
      {
        center_id: centerId,
        day_of_week: day,
        opens_at: isClosed ? null : opensAt,
        closes_at: isClosed ? null : closesAt,
        is_closed: isClosed,
      },
      { onConflict: "center_id,day_of_week" },
    );
    if (error) return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "business_hours.update",
    entityType: "business_hours",
    entityId: centerId,
  });

  revalidatePath("/settings/sla");
  return { success: "Business hours saved." };
}

const holidaySchema = z.object({
  date: z.string().trim().min(1, "Date is required"),
  name: z.string().trim().min(1, "Name is required"),
});

export async function createHoliday(
  centerId: string,
  _prevState: SlaFormState,
  formData: FormData,
): Promise<SlaFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "rules.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const parsed = holidaySchema.safeParse({ date: formData.get("date"), name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("holidays")
    .insert({ center_id: centerId, date: parsed.data.date, name: parsed.data.name });

  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "holiday.create",
    entityType: "holidays",
    after: { centerId, ...parsed.data },
  });

  revalidatePath("/settings/sla");
  return { success: "Holiday added." };
}

export async function deleteHoliday(holidayId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !can(user, "rules.manage")) return;

  const supabase = await createClient();
  const { error } = await supabase.from("holidays").delete().eq("id", holidayId);
  if (error) return;

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "holiday.delete",
    entityType: "holidays",
    entityId: holidayId,
  });

  revalidatePath("/settings/sla");
}
