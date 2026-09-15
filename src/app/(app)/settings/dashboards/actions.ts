"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { WIDGET_KEYS } from "@/lib/dashboard/widgets";
import { createClient } from "@/lib/supabase/server";

export interface DashboardFormState {
  error?: string;
  success?: string;
}

const layoutSchema = z.object({
  roleId: z.string().uuid("Pick a role."),
  /** Widget keys in the order the admin arranged them. */
  order: z.array(z.enum(WIDGET_KEYS as [string, ...string[]])),
  visible: z.array(z.enum(WIDGET_KEYS as [string, ...string[]])),
});

/**
 * Save one role's arrangement.
 *
 * Written as a full replacement rather than a per-widget toggle: the
 * order is the point, and a screen that saved each switch separately
 * would leave a half-applied arrangement behind if a request failed
 * partway. The delete-then-insert runs against `dashboard_layouts` only,
 * which holds nothing but this arrangement (see migration 0067 on why
 * hard delete is allowed here and nowhere else in configuration).
 */
export async function saveDashboardLayout(
  _prevState: DashboardFormState,
  formData: FormData,
): Promise<DashboardFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const parsed = layoutSchema.safeParse({
    roleId: formData.get("roleId"),
    order: formData.getAll("order").map(String),
    visible: formData.getAll("visible").map(String),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const { roleId, order, visible } = parsed.data;
  const visibleSet = new Set(visible);

  const supabase = await createClient();

  const { error: clearError } = await supabase
    .from("dashboard_layouts")
    .delete()
    .eq("role_id", roleId);
  if (clearError) return { error: clearError.message };

  if (order.length > 0) {
    const { error } = await supabase.from("dashboard_layouts").insert(
      order.map((widgetKey, index) => ({
        role_id: roleId,
        widget_key: widgetKey,
        sort_order: index,
        is_visible: visibleSet.has(widgetKey),
      })),
    );
    if (error) return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "dashboard_layout.update",
    entityType: "dashboard_layouts",
    entityId: roleId,
    after: { order, hidden: order.filter((key) => !visibleSet.has(key)) },
  });

  revalidatePath("/dashboard");
  revalidatePath("/settings/dashboards");
  return { success: "Saved. Anybody on this role sees it on their next page load." };
}

/**
 * Throw the arrangement away, which is a real state and not the same as
 * hiding everything: with no rows, the role falls back to every widget
 * its permissions allow.
 */
export async function resetDashboardLayout(roleId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("dashboard_layouts").delete().eq("role_id", roleId);
  if (error) return { error: error.message };

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "dashboard_layout.delete",
    entityType: "dashboard_layouts",
    entityId: roleId,
  });

  revalidatePath("/dashboard");
  revalidatePath("/settings/dashboards");
  return {};
}
