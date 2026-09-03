"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { leads } from "@/lib/db/schema";
import { confirmAdmission } from "@/lib/enrolment/confirm-admission";
import { fieldColumn } from "@/lib/fields/field-column";
import { getFieldSchema } from "@/lib/fields/get-field-schema";
import { parseRupeesToPaise } from "@/lib/format/currency";
import { notify } from "@/lib/notifications/notify";
import { createClient } from "@/lib/supabase/server";

export interface FormState {
  error?: string;
  success?: string;
}

/**
 * Every editable field the schema knows about, written through one path —
 * a core field to its real column, a custom one merged into `custom`
 * jsonb. Phone-type fields are never handled here regardless of their
 * is_editable flag: editing a lead's phone needs to also update
 * lead_identifiers (the dedup index), which is a dedicated flow this
 * session doesn't build — see docs/DECISIONS.md.
 */
export async function updateLead(leadId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.update")) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  const fields = await getFieldSchema(supabase, "lead", user);

  const { data: existing, error: readError } = await supabase
    .from("leads")
    .select("custom, temperature")
    .eq("id", leadId)
    .maybeSingle<{ custom: Record<string, unknown> | null; temperature: string | null }>();

  // A transient read failure here must not fall through to `?? {}` below —
  // that would make the update at the end of this function overwrite the
  // lead's entire `custom` jsonb with only this form's fields, silently
  // discarding every other custom value the lead already had.
  if (readError) {
    return { error: `Could not load current field values: ${readError.message}` };
  }

  const coreUpdates: Record<string, unknown> = {};
  const customUpdates: Record<string, unknown> = { ...(existing?.custom ?? {}) };
  let touchedCustom = false;

  for (const field of fields) {
    if (field.type === "phone" || !field.isEditable) continue;

    let value: unknown;
    if (field.type === "boolean") {
      value = formData.get(field.key) === "on";
    } else if (field.type === "multiselect") {
      value = formData.getAll(field.key).map(String).filter(Boolean);
    } else {
      const raw = formData.get(field.key);
      if (raw === null) continue; // field wasn't rendered in this form at all
      if (raw === "") {
        value = null;
      } else if (field.type === "number" || field.type === "currency") {
        value = Number(raw);
      } else {
        value = raw;
      }
    }

    if (field.isRequired && (value === null || value === "" || (Array.isArray(value) && value.length === 0))) {
      return { error: `${field.label} is required.` };
    }

    if (field.isCore) {
      coreUpdates[fieldColumn(field.key)] = value;
    } else {
      customUpdates[field.key] = value;
      touchedCustom = true;
    }
  }

  // A human changing `temperature` here is exactly the "counsellor's manual
  // judgement" docs/01-DATA-MODEL.md § Temperature describes — it must beat
  // the recompute cron for a configurable number of days, or the cron would
  // silently overwrite this edit on its very next run. Only stamped on a
  // genuine change (not a same-value re-submit of the whole form) so an
  // unrelated field edit doesn't keep resetting the override window.
  if ("temperature" in coreUpdates && coreUpdates.temperature !== existing?.temperature) {
    const { data: org } = await supabase
      .from("org_settings")
      .select("temperature_override_days")
      .maybeSingle<{ temperature_override_days: number }>();
    const overrideDays = org?.temperature_override_days ?? 3;
    coreUpdates.temperature_override_until = new Date(
      Date.now() + overrideDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    coreUpdates.temperature_set_by = user.id;
  }

  const payload = touchedCustom ? { ...coreUpdates, custom: customUpdates } : coreUpdates;
  const { error } = await supabase.from("leads").update(payload).eq("id", leadId);
  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "lead.update",
    entityType: "leads",
    entityId: leadId,
    after: payload,
  });

  revalidatePath(`/leads/${leadId}`);
  return { success: "Saved." };
}

const interactionSchema = {
  type: (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v : null),
  nextAction: (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null),
};

/**
 * CLAUDE.md/docs/02-BUILD-PHASES.md: "mandatory next action on every
 * interaction log." Enforced here in application code AND at the database
 * level (the CHECK constraint on `interactions` — see migration 0009) so
 * neither this form nor any future caller can skip it.
 */
export async function logInteraction(leadId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "interaction.create")) {
    return { error: "You don't have permission to do that." };
  }

  const type = interactionSchema.type(formData.get("type"));
  const nextAction = interactionSchema.nextAction(formData.get("nextAction"));
  if (!type) return { error: "Interaction type is required." };
  if (!nextAction) return { error: "Next action is required." };

  const direction = formData.get("direction");
  const outcome = formData.get("outcome");
  const notes = formData.get("notes");
  const durationRaw = formData.get("durationSeconds");
  const nextFollowupAtRaw = formData.get("nextFollowupAt");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("interactions")
    .insert({
      lead_id: leadId,
      type,
      direction: direction || null,
      outcome: outcome || null,
      notes: notes || null,
      duration_seconds: durationRaw ? Number(durationRaw) : null,
      next_action: nextAction,
      next_followup_at: nextFollowupAtRaw || null,
      created_by: user.id,
      source: "manual",
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  // The interaction log's own next_followup_at is the counsellor's stated
  // plan — mirror it onto the lead so "My Day" (Phase 2) and the list can
  // surface it without joining interactions.
  if (nextFollowupAtRaw) {
    await supabase.from("leads").update({ next_followup_at: nextFollowupAtRaw }).eq("id", leadId);
  }

  const nowIso = new Date().toISOString();

  // last_activity_at updates on every interaction — unlike first_response_at
  // below, there's no "only the first time" gate here.
  await supabase.from("leads").update({ last_activity_at: nowIso }).eq("id", leadId);

  // Stamp first_response_at the first time any interaction is logged for
  // this lead — the SLA sweep's `first_response` measure has nothing to
  // count from until this exists (docs/01-DATA-MODEL.md § SLA policies).
  // The `.is(...)` filter makes this a no-op on every later interaction:
  // once responded, this is set for good.
  await supabase
    .from("leads")
    .update({ first_response_at: nowIso })
    .eq("id", leadId)
    .is("first_response_at", null);

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "interaction.create",
    entityType: "interactions",
    entityId: data.id,
    after: { type, outcome, nextAction },
  });

  revalidatePath(`/leads/${leadId}`);
  return { success: "Interaction logged." };
}

export async function createTask(leadId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "interaction.create")) {
    return { error: "You don't have permission to do that." };
  }

  const title = formData.get("title");
  if (typeof title !== "string" || !title.trim()) {
    return { error: "Task title is required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    lead_id: leadId,
    title: title.trim(),
    type: formData.get("type") || null,
    due_at: formData.get("dueAt") || null,
    assigned_to: (formData.get("assignedTo") as string) || user.id,
    created_by: user.id,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/leads/${leadId}`);
  return { success: "Task added." };
}

export async function completeTask(taskId: string, leadId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !can(user, "interaction.create")) return;

  const supabase = await createClient();
  await supabase
    .from("tasks")
    .update({ status: "done", completed_at: new Date().toISOString(), completed_by: user.id })
    .eq("id", taskId);

  revalidatePath(`/leads/${leadId}`);
}

/**
 * Gate 1 (sales -> accounts). confirmAdmission() runs on the direct db
 * client (see its own doc comment), so — same pattern as
 * confirmMerge()/createLeadManually() — this action is the enforcement
 * point: re-implements the own/center/all scope check `can_access_center()`
 * would apply, checked against the lead before ever touching the database.
 */
export async function confirmAdmissionAction(
  leadId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "enrolment.create")) {
    return { error: "You don't have permission to do that." };
  }
  const scope = scopeFor(user, "enrolment.create");
  if (!scope) {
    return { error: "You don't have permission to do that." };
  }

  const course = formData.get("course");
  const mode = formData.get("mode");
  const academicYear = formData.get("academicYear");
  if (typeof course !== "string" || !course) return { error: "Course is required." };
  if (typeof mode !== "string" || !mode) return { error: "Mode is required." };
  if (typeof academicYear !== "string" || !academicYear.trim()) {
    return { error: "Academic year is required." };
  }

  const discountPaise = parseRupeesToPaise(formData.get("discount")) ?? 0;
  const feeOverrideRaw = formData.get("totalFeeOverride");
  const totalFeePaiseOverride =
    typeof feeOverrideRaw === "string" && feeOverrideRaw.trim() !== "" ? parseRupeesToPaise(feeOverrideRaw) : null;
  if (typeof feeOverrideRaw === "string" && feeOverrideRaw.trim() !== "" && totalFeePaiseOverride === null) {
    return { error: "Manual fee override must be a valid amount." };
  }

  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead || lead.deletedAt) {
    return { error: "This lead no longer exists." };
  }
  if (scope === "own" && lead.assignedTo !== user.id) {
    return { error: "This lead is outside your access." };
  }
  if (scope === "center" && (!lead.centerId || !user.centerIds.includes(lead.centerId))) {
    return { error: "This lead is outside your access." };
  }
  if (!lead.centerId) {
    return { error: "This lead has no centre assigned yet — set one before confirming admission." };
  }

  let result;
  try {
    result = await db.transaction((tx) =>
      confirmAdmission(tx, {
        leadId,
        course,
        centerId: lead.centerId!,
        mode,
        academicYear: academicYear.trim(),
        totalFeePaiseOverride,
        discountPaise,
        confirmedBy: user.id,
      }),
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not confirm admission." };
  }

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "enrolment.create",
    entityType: "enrolments",
    entityId: result.enrolmentId,
    after: { leadId, course, mode, academicYear: academicYear.trim(), netFeePaise: result.netFeePaise },
  });

  // Accounts has work now, and until this existed they found out by
  // refreshing a page. Notified after the transaction committed, so the
  // message can never describe an admission that was rolled back.
  await notify({
    eventKey: "admission.confirmed",
    context: {
      lead_name: lead.studentName,
      lead_number: lead.leadNumber,
      course,
      counsellor_name: user.fullName,
    },
    href: `/accounts/${result.enrolmentId}`,
    entityType: "enrolments",
    entityId: result.enrolmentId,
    centerId: lead.centerId,
    ownerId: lead.assignedTo,
    actorId: user.id,
  });

  revalidatePath(`/leads/${leadId}`);
  return { success: "Admission confirmed." };
}

/**
 * Applying/removing a tag is treated as a lead edit — gated on lead.update,
 * same permission the rest of this file's mutations use, rather than a new
 * primitive (lead_tags' own RLS insert/delete policies check the same
 * thing, so this is defence in depth, not the only check).
 */
export async function addLeadTag(leadId: string, tagId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.update")) return;

  const supabase = await createClient();
  const { error } = await supabase.from("lead_tags").insert({ lead_id: leadId, tag_id: tagId, tagged_by: user.id });
  if (error) return;

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "lead.tag_add",
    entityType: "leads",
    entityId: leadId,
    after: { tagId },
  });

  revalidatePath(`/leads/${leadId}`);
}

export async function removeLeadTag(leadId: string, tagId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.update")) return;

  const supabase = await createClient();
  const { error } = await supabase.from("lead_tags").delete().eq("lead_id", leadId).eq("tag_id", tagId);
  if (error) return;

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "lead.tag_remove",
    entityType: "leads",
    entityId: leadId,
    after: { tagId },
  });

  revalidatePath(`/leads/${leadId}`);
}
