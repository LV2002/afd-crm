"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { STAGE_TYPES } from "./constants";

export interface StageFormState {
  error?: string;
  success?: string;
}

const stageSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #0ea5e9")
    .optional()
    .or(z.literal("")),
  stageType: z.enum(STAGE_TYPES),
  probability: z.coerce.number().min(0).max(100).optional(),
  slaHours: z.coerce.number().int().positive().optional(),
  requiresReason: z.coerce.boolean().optional(),
  requiredFields: z.string().trim().optional().or(z.literal("")),
});

function parseRequiredFields(raw: string | undefined) {
  if (!raw) return null;
  const fields = raw
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  return fields.length > 0 ? fields : null;
}

export async function createStage(
  _prevState: StageFormState,
  formData: FormData,
): Promise<StageFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const parsed = stageSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color"),
    stageType: formData.get("stageType"),
    probability: formData.get("probability") || undefined,
    slaHours: formData.get("slaHours") || undefined,
    requiresReason: formData.get("requiresReason") === "on",
    requiredFields: formData.get("requiredFields"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();

  const { count } = await supabase.from("pipeline_stages").select("id", { count: "exact", head: true });

  const { data, error } = await supabase
    .from("pipeline_stages")
    .insert({
      name: parsed.data.name,
      color: parsed.data.color || null,
      stage_type: parsed.data.stageType,
      probability: parsed.data.probability?.toString() ?? null,
      sla_hours: parsed.data.slaHours ?? null,
      requires_reason: parsed.data.requiresReason ?? false,
      required_fields: parseRequiredFields(parsed.data.requiredFields),
      sort_order: count ?? 0,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "pipeline_stage.create",
    entityType: "pipeline_stages",
    entityId: data.id,
    after: parsed.data,
  });

  revalidatePath("/settings/pipeline-stages");
  redirect(`/settings/pipeline-stages/${data.id}`);
}

export async function updateStage(
  stageId: string,
  _prevState: StageFormState,
  formData: FormData,
): Promise<StageFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const parsed = stageSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color"),
    stageType: formData.get("stageType"),
    probability: formData.get("probability") || undefined,
    slaHours: formData.get("slaHours") || undefined,
    requiresReason: formData.get("requiresReason") === "on",
    requiredFields: formData.get("requiredFields"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("pipeline_stages")
    .update({
      name: parsed.data.name,
      color: parsed.data.color || null,
      stage_type: parsed.data.stageType,
      probability: parsed.data.probability?.toString() ?? null,
      sla_hours: parsed.data.slaHours ?? null,
      requires_reason: parsed.data.requiresReason ?? false,
      required_fields: parseRequiredFields(parsed.data.requiredFields),
    })
    .eq("id", stageId);

  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "pipeline_stage.update",
    entityType: "pipeline_stages",
    entityId: stageId,
    after: parsed.data,
  });

  revalidatePath("/settings/pipeline-stages");
  revalidatePath(`/settings/pipeline-stages/${stageId}`);
  return { success: "Saved." };
}

export async function setStageActive(stageId: string, isActive: boolean): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return;

  const supabase = await createClient();
  const { error } = await supabase.from("pipeline_stages").update({ is_active: isActive }).eq("id", stageId);
  if (error) return;

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: isActive ? "pipeline_stage.activate" : "pipeline_stage.deactivate",
    entityType: "pipeline_stages",
    entityId: stageId,
  });

  revalidatePath("/settings/pipeline-stages");
}

/**
 * Reorder by swapping sort_order with the adjacent stage. A visual
 * drag-to-reorder UI was scoped out for this pass in favour of these two
 * buttons — same outcome (an admin can reorder stages), no new drag
 * library dependency. See docs/DECISIONS.md.
 */
export async function moveStage(stageId: string, direction: "up" | "down"): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return;

  const supabase = await createClient();
  const { data: stages } = await supabase
    .from("pipeline_stages")
    .select("id, sort_order")
    .order("sort_order")
    .returns<Array<{ id: string; sort_order: number }>>();

  if (!stages) return;

  const index = stages.findIndex((s) => s.id === stageId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapIndex < 0 || swapIndex >= stages.length) return;

  const current = stages[index];
  const swap = stages[swapIndex];

  await supabase.from("pipeline_stages").update({ sort_order: swap.sort_order }).eq("id", current.id);
  await supabase.from("pipeline_stages").update({ sort_order: current.sort_order }).eq("id", swap.id);

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "pipeline_stage.reorder",
    entityType: "pipeline_stages",
    entityId: stageId,
    after: { direction },
  });

  revalidatePath("/settings/pipeline-stages");
}

export async function deleteStage(stageId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  // Soft delete (CLAUDE.md non-negotiable #5: nothing is hard-deleted) —
  // pipeline_stages has a deleted_at column for exactly this. Also clears
  // is_active so every existing is_active=true query (kanban columns, the
  // stage_id filter/option list) stops surfacing it, same as deactivating.
  // A hard DELETE here used to hit leads.stage_id's onDelete:'restrict' FK
  // with a raw Postgres error whenever the stage still had leads in it.
  const { error } = await supabase
    .from("pipeline_stages")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", stageId);
  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "pipeline_stage.delete",
    entityType: "pipeline_stages",
    entityId: stageId,
  });

  revalidatePath("/settings/pipeline-stages");
  return {};
}
