"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { FIELD_ENTITIES, FIELD_TYPES } from "./constants";

export interface FieldFormState {
  error?: string;
  success?: string;
}

const optionsLineSchema = z.string().trim().optional().or(z.literal(""));

function parseOptionLines(raw: string | undefined) {
  if (!raw) return null;
  const options = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [value, ...rest] = line.split(":");
      const label = rest.join(":").trim();
      return { value: value.trim(), label: label || value.trim() };
    });
  return options.length > 0 ? options : null;
}

const baseSchema = z.object({
  entity: z.enum(FIELD_ENTITIES),
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, numbers and underscores"),
  label: z.string().trim().min(1, "Label is required"),
  helpText: z.string().trim().optional().or(z.literal("")),
  type: z.enum(FIELD_TYPES),
  section: z.string().trim().min(1, "Section is required"),
  isRequired: z.coerce.boolean().optional(),
  showInList: z.coerce.boolean().optional(),
  showInFilters: z.coerce.boolean().optional(),
  options: optionsLineSchema,
});

function readCommon(formData: FormData) {
  return {
    entity: formData.get("entity"),
    key: formData.get("key"),
    label: formData.get("label"),
    helpText: formData.get("helpText"),
    type: formData.get("type"),
    section: formData.get("section"),
    isRequired: formData.get("isRequired") === "on",
    showInList: formData.get("showInList") === "on",
    showInFilters: formData.get("showInFilters") === "on",
    options: formData.get("options"),
  };
}

export async function createField(
  _prevState: FieldFormState,
  formData: FormData,
): Promise<FieldFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const parsed = baseSchema.safeParse(readCommon(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const visibleToRoles = formData.getAll("visibleToRoles").map(String).filter(Boolean);
  const editableByRoles = formData.getAll("editableByRoles").map(String).filter(Boolean);

  const supabase = await createClient();
  const { count } = await supabase
    .from("field_definitions")
    .select("id", { count: "exact", head: true })
    .eq("entity", parsed.data.entity);

  const { data, error } = await supabase
    .from("field_definitions")
    .insert({
      entity: parsed.data.entity,
      key: parsed.data.key,
      label: parsed.data.label,
      help_text: parsed.data.helpText || null,
      type: parsed.data.type,
      section: parsed.data.section,
      is_required: parsed.data.isRequired ?? false,
      show_in_list: parsed.data.showInList ?? false,
      show_in_filters: parsed.data.showInFilters ?? false,
      options: parseOptionLines(parsed.data.options),
      visible_to_roles: visibleToRoles.length > 0 ? visibleToRoles : null,
      editable_by_roles: editableByRoles.length > 0 ? editableByRoles : null,
      sort_order: count ?? 0,
      is_core: false,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "field_definition.create",
    entityType: "field_definitions",
    entityId: data.id,
    after: parsed.data,
  });

  revalidatePath("/settings/fields");
  redirect(`/settings/fields/${data.id}`);
}

const updateSchema = baseSchema.omit({ entity: true, key: true, type: true });

export async function updateField(
  fieldId: string,
  _prevState: FieldFormState,
  formData: FormData,
): Promise<FieldFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const common = readCommon(formData);
  const parsed = updateSchema.safeParse(common);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const visibleToRoles = formData.getAll("visibleToRoles").map(String).filter(Boolean);
  const editableByRoles = formData.getAll("editableByRoles").map(String).filter(Boolean);

  const supabase = await createClient();
  const { error } = await supabase
    .from("field_definitions")
    .update({
      label: parsed.data.label,
      help_text: parsed.data.helpText || null,
      section: parsed.data.section,
      is_required: parsed.data.isRequired ?? false,
      show_in_list: parsed.data.showInList ?? false,
      show_in_filters: parsed.data.showInFilters ?? false,
      options: parseOptionLines(parsed.data.options),
      visible_to_roles: visibleToRoles.length > 0 ? visibleToRoles : null,
      editable_by_roles: editableByRoles.length > 0 ? editableByRoles : null,
    })
    .eq("id", fieldId);

  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "field_definition.update",
    entityType: "field_definitions",
    entityId: fieldId,
    after: parsed.data,
  });

  revalidatePath("/settings/fields");
  revalidatePath(`/settings/fields/${fieldId}`);
  return { success: "Saved." };
}

export async function setFieldActive(fieldId: string, isActive: boolean): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return;

  const supabase = await createClient();
  const { error } = await supabase.from("field_definitions").update({ is_active: isActive }).eq("id", fieldId);
  if (error) return;

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: isActive ? "field_definition.activate" : "field_definition.deactivate",
    entityType: "field_definitions",
    entityId: fieldId,
  });

  revalidatePath("/settings/fields");
}

export async function deleteField(fieldId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("field_definitions").delete().eq("id", fieldId);
  if (error) {
    // Covers the protect_core_field_definitions trigger for is_core rows.
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "field_definition.delete",
    entityType: "field_definitions",
    entityId: fieldId,
  });

  revalidatePath("/settings/fields");
  return {};
}
