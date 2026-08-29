"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { fieldColumn } from "@/lib/fields/field-column";
import { getFieldSchema } from "@/lib/fields/get-field-schema";
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
