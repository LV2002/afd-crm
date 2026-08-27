"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
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

function parseJsonOrNull(raw: string | undefined) {
  if (!raw) return { ok: true as const, value: null };
  try {
    return { ok: true as const, value: JSON.parse(raw) };
  } catch {
    return { ok: false as const };
  }
}

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

  const appliesTo = parseJsonOrNull(parsed.data.appliesTo);
  if (!appliesTo.ok) return { error: "Applies-to must be valid JSON." };
  const escalations = parseJsonOrNull(parsed.data.escalations);
  if (!escalations.ok || (escalations.value !== null && !Array.isArray(escalations.value))) {
    return { error: "Escalations must be a JSON array." };
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
      escalations: escalations.value,
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
