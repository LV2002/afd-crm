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

  const { data: existing } = await supabase
    .from("leads")
    .select("custom")
    .eq("id", leadId)
    .maybeSingle<{ custom: Record<string, unknown> | null }>();

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
