"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export interface CenterFormState {
  error?: string;
  success?: string;
}

const centerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  city: z.string().trim().min(1, "City is required"),
  address: z.string().trim().optional().or(z.literal("")),
  timezone: z.string().trim().min(1),
});

export async function createCenter(
  _prevState: CenterFormState,
  formData: FormData,
): Promise<CenterFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const parsed = centerSchema.safeParse({
    name: formData.get("name"),
    city: formData.get("city"),
    address: formData.get("address"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("centers")
    .insert({
      name: parsed.data.name,
      city: parsed.data.city,
      address: parsed.data.address || null,
      timezone: parsed.data.timezone,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "center.create",
    entityType: "center",
    entityId: data.id,
    after: parsed.data,
  });

  revalidatePath("/settings/centers");
  redirect(`/settings/centers/${data.id}`);
}

export async function updateCenter(
  centerId: string,
  _prevState: CenterFormState,
  formData: FormData,
): Promise<CenterFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const parsed = centerSchema.safeParse({
    name: formData.get("name"),
    city: formData.get("city"),
    address: formData.get("address"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("centers")
    .update({
      name: parsed.data.name,
      city: parsed.data.city,
      address: parsed.data.address || null,
      timezone: parsed.data.timezone,
    })
    .eq("id", centerId);

  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "center.update",
    entityType: "center",
    entityId: centerId,
    after: parsed.data,
  });

  revalidatePath("/settings/centers");
  revalidatePath(`/settings/centers/${centerId}`);
  return { success: "Saved." };
}

export async function setCenterActive(centerId: string, isActive: boolean): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return;

  const supabase = await createClient();
  const { error } = await supabase.from("centers").update({ is_active: isActive }).eq("id", centerId);
  if (error) return;

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: isActive ? "center.activate" : "center.deactivate",
    entityType: "center",
    entityId: centerId,
  });

  revalidatePath("/settings/centers");
  revalidatePath(`/settings/centers/${centerId}`);
}

export async function setUserCenterAssignment(
  userId: string,
  centerId: string,
  assigned: boolean,
): Promise<void> {
  const actor = await getCurrentUser();
  // user_centers mutations are gated on users.manage at the RLS layer
  // (see migration 0001), not settings.manage — mirror that here.
  if (!actor || !can(actor, "users.manage")) return;

  const supabase = await createClient();

  if (assigned) {
    await supabase.from("user_centers").insert({ user_id: userId, center_id: centerId });
  } else {
    await supabase.from("user_centers").delete().eq("user_id", userId).eq("center_id", centerId);
  }

  await writeAuditLog(supabase, {
    actorId: actor.id,
    action: assigned ? "user_center.assign" : "user_center.unassign",
    entityType: "user_centers",
    entityId: centerId,
    after: { userId, centerId },
  });

  revalidatePath(`/settings/centers/${centerId}`);
  revalidatePath(`/settings/users/${userId}`);
}
