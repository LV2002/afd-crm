"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export interface OptionFormState {
  error?: string;
  success?: string;
}

const optionSchema = z.object({
  value: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, numbers and underscores"),
  label: z.string().trim().min(1, "Label is required"),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour")
    .optional()
    .or(z.literal("")),
});

export async function createOption(
  category: string,
  _prevState: OptionFormState,
  formData: FormData,
): Promise<OptionFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const parsed = optionSchema.safeParse({
    value: formData.get("value"),
    label: formData.get("label"),
    color: formData.get("color"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from("dropdown_options")
    .select("id", { count: "exact", head: true })
    .eq("category", category);

  const { data, error } = await supabase
    .from("dropdown_options")
    .insert({
      category,
      value: parsed.data.value,
      label: parsed.data.label,
      color: parsed.data.color || null,
      sort_order: count ?? 0,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "dropdown_option.create",
    entityType: "dropdown_options",
    entityId: data.id,
    after: { category, ...parsed.data },
  });

  revalidatePath(`/settings/dropdowns/${category}`);
  revalidatePath("/settings/temperatures");
  return { success: "Added." };
}

export async function updateOption(
  optionId: string,
  category: string,
  _prevState: OptionFormState,
  formData: FormData,
): Promise<OptionFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const parsed = optionSchema.safeParse({
    value: formData.get("value"),
    label: formData.get("label"),
    color: formData.get("color"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("dropdown_options")
    .update({ value: parsed.data.value, label: parsed.data.label, color: parsed.data.color || null })
    .eq("id", optionId);

  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "dropdown_option.update",
    entityType: "dropdown_options",
    entityId: optionId,
    after: parsed.data,
  });

  revalidatePath(`/settings/dropdowns/${category}`);
  revalidatePath("/settings/temperatures");
  return { success: "Saved." };
}

export async function setOptionActive(optionId: string, category: string, isActive: boolean): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return;

  const supabase = await createClient();
  const { error } = await supabase.from("dropdown_options").update({ is_active: isActive }).eq("id", optionId);
  if (error) return;

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: isActive ? "dropdown_option.activate" : "dropdown_option.deactivate",
    entityType: "dropdown_options",
    entityId: optionId,
  });

  revalidatePath(`/settings/dropdowns/${category}`);
  revalidatePath("/settings/temperatures");
}

export async function deleteOption(optionId: string, category: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  // Soft delete (CLAUDE.md non-negotiable #5: nothing is hard-deleted) —
  // dropdown_options has a deleted_at column for exactly this. Also clears
  // is_active so the option stops appearing anywhere is_active=true is
  // already filtered (getDropdownOptions, temperature rule forms, etc).
  const { error } = await supabase
    .from("dropdown_options")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", optionId);
  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "dropdown_option.delete",
    entityType: "dropdown_options",
    entityId: optionId,
  });

  revalidatePath(`/settings/dropdowns/${category}`);
  revalidatePath("/settings/temperatures");
  return {};
}

export async function moveOption(
  optionId: string,
  category: string,
  direction: "up" | "down",
): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return;

  const supabase = await createClient();
  const { data: options } = await supabase
    .from("dropdown_options")
    .select("id, sort_order")
    .eq("category", category)
    .order("sort_order")
    .returns<Array<{ id: string; sort_order: number }>>();

  if (!options) return;

  const index = options.findIndex((o) => o.id === optionId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapIndex < 0 || swapIndex >= options.length) return;

  const current = options[index];
  const swap = options[swapIndex];

  await supabase.from("dropdown_options").update({ sort_order: swap.sort_order }).eq("id", current.id);
  await supabase.from("dropdown_options").update({ sort_order: current.sort_order }).eq("id", swap.id);

  revalidatePath(`/settings/dropdowns/${category}`);
  revalidatePath("/settings/temperatures");
}

const categorySchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, numbers and underscores"),
  label: z.string().trim().min(1, "Label is required"),
});

export interface CategoryFormState {
  error?: string;
  success?: string;
}

export async function createCategory(
  _prevState: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const parsed = categorySchema.safeParse({ key: formData.get("key"), label: formData.get("label") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("dropdown_categories").insert(parsed.data);
  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "dropdown_category.create",
    entityType: "dropdown_categories",
    entityId: parsed.data.key,
    after: parsed.data,
  });

  revalidatePath("/settings/dropdowns");
  return { success: "Category created." };
}
