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

// The Options textarea only renders in the form when type is select/multiselect
// (see field-form.tsx) — for every other type the field is absent from the
// DOM entirely, so the browser submits nothing and FormData.get("options")
// comes back `null`, not `""` or `undefined`. `.nullish()` accepts both.
const optionsLineSchema = z.string().trim().nullish().or(z.literal(""));

function parseOptionLines(raw: string | null | undefined) {
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
      // A new student field goes onto the student-facing profile form by
      // default, because "Add a question" from Settings → Student Profile
      // Form is overwhelmingly why one gets created. Not offered as a
      // checkbox here: this generic form can't reliably show a control
      // that depends on the entity dropdown's live value, and the builder
      // screen shows the placement plainly with one switch to change it.
      on_profile_form: parsed.data.entity === "student",
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
  revalidatePath("/settings/profile-form");
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
  revalidatePath("/settings/profile-form");
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
  // Soft delete (CLAUDE.md non-negotiable #5: nothing is hard-deleted) —
  // field_definitions has a deleted_at column for exactly this. Also
  // clears is_active so the field stops appearing anywhere is_active=true
  // is already filtered (getFieldSchema drives the form/list/filters/export).
  //
  // Filtering on is_core=false in the WHERE clause (rather than checking it
  // in a separate read first) is the soft-delete equivalent of the
  // protect_core_field_definitions DB trigger, which only fires on a real
  // DELETE and would no longer run now that this is an UPDATE. The UI
  // already hides the delete action for core fields (field-row-actions.tsx)
  // — this is the same defense-in-depth the trigger used to provide against
  // a direct call bypassing the UI.
  const { data, error } = await supabase
    .from("field_definitions")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", fieldId)
    .eq("is_core", false)
    .select("id")
    .maybeSingle();
  if (error) {
    return { error: error.message };
  }
  if (!data) {
    return { error: "Core field definitions cannot be deleted." };
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
