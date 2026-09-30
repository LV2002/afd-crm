"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { countFieldAnswers } from "@/lib/fields/count-answers";
import type { FieldEntity } from "@/lib/fields/get-field-schema";
import { createClient } from "@/lib/supabase/server";

import { FIELD_ENTITIES, FIELD_TYPE_LABELS, FIELD_TYPES } from "./constants";

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

/**
 * `entity` and `key` are fixed forever — they are where the answers live,
 * and moving them would orphan every one. `type` is not in that list: it
 * can change while nothing has answered the field, which is the difference
 * between "I picked the wrong type five minutes ago" and "forty students
 * have replied". The guard is below, in `updateField`.
 */
const updateSchema = baseSchema.omit({ entity: true, key: true });

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

  const { data: current, error: readError } = await supabase
    .from("field_definitions")
    .select("entity, key, type, is_core")
    .eq("id", fieldId)
    .maybeSingle<{ entity: FieldEntity; key: string; type: string; is_core: boolean }>();

  if (readError) return { error: readError.message };
  if (!current) return { error: "That field no longer exists." };

  const typeChanged = parsed.data.type !== current.type;

  if (typeChanged) {
    // A core field's type is the shape of a real column, not a jsonb value.
    // Nothing in the form offers to change it; this refuses a request that
    // did not come from the form.
    if (current.is_core) {
      return { error: "This is a built-in field. Its type cannot be changed." };
    }

    const answered = await countFieldAnswers(current.entity, current.key);
    if (answered > 0) {
      // Refused rather than migrated. There is no honest conversion from a
      // typed-in web address to an uploaded file, and guessing one would
      // silently destroy the answers — CLAUDE.md § Non-negotiables 5.
      return {
        error:
          `${answered} ${answered === 1 ? "person has" : "people have"} already answered this ` +
          `question, so its type can no longer change — their answers are ` +
          `${FIELD_TYPE_LABELS[current.type as keyof typeof FIELD_TYPE_LABELS]?.label ?? current.type} ` +
          `and nothing can turn them into ` +
          `${FIELD_TYPE_LABELS[parsed.data.type].label}. Add a new question of the right type ` +
          `and switch this one off instead, so the old answers stay readable.`,
      };
    }
  }

  const { error } = await supabase
    .from("field_definitions")
    .update({
      label: parsed.data.label,
      type: parsed.data.type,
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
  // Every screen that renders this field's input reads the type, so they
  // all have to be told — a lead form still showing a text box for what is
  // now an upload is the bug this whole change exists to fix.
  if (typeChanged) revalidatePath("/leads", "layout");
  return {
    success: typeChanged
      ? `Saved. This question is now a ${FIELD_TYPE_LABELS[parsed.data.type].label.toLowerCase()}.`
      : "Saved.",
  };
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
