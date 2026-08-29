"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export interface TagFormState {
  error?: string;
  success?: string;
}

const tagSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Colour must be a hex value like #0ea5e9")
    .optional()
    .or(z.literal("")),
});

export async function createTag(_prevState: TagFormState, formData: FormData): Promise<TagFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const parsed = tagSchema.safeParse({ name: formData.get("name"), color: formData.get("color") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tags")
    .insert({ name: parsed.data.name, color: parsed.data.color || null })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "tag.create",
    entityType: "tags",
    entityId: data.id,
    after: parsed.data,
  });

  revalidatePath("/settings/tags");
  redirect(`/settings/tags/${data.id}`);
}

export async function updateTag(
  tagId: string,
  _prevState: TagFormState,
  formData: FormData,
): Promise<TagFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const parsed = tagSchema.safeParse({ name: formData.get("name"), color: formData.get("color") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tags")
    .update({ name: parsed.data.name, color: parsed.data.color || null })
    .eq("id", tagId);

  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "tag.update",
    entityType: "tags",
    entityId: tagId,
    after: parsed.data,
  });

  revalidatePath("/settings/tags");
  revalidatePath(`/settings/tags/${tagId}`);
  return { success: "Saved." };
}

export async function setTagActive(tagId: string, isActive: boolean): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return;

  const supabase = await createClient();
  const { error } = await supabase.from("tags").update({ is_active: isActive }).eq("id", tagId);
  if (error) return;

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: isActive ? "tag.activate" : "tag.deactivate",
    entityType: "tags",
    entityId: tagId,
  });

  revalidatePath("/settings/tags");
  revalidatePath(`/settings/tags/${tagId}`);
}
