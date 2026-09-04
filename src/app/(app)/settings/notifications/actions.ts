"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { isNotificationEventKey } from "@/lib/notifications/events";
import { createClient } from "@/lib/supabase/server";

export interface NotificationSettingState {
  error?: string;
  success?: string;
}

const schema = z.object({
  eventKey: z.string().refine(isNotificationEventKey, "Unknown event."),
  isEnabled: z.boolean(),
  notifyOwner: z.boolean(),
  titleTemplate: z.string().trim().min(1, "The title can't be empty."),
  bodyTemplate: z.string().trim().min(1, "The message can't be empty."),
});

/**
 * Saves one event's notification rule.
 *
 * Upsert rather than update: a fresh install has no rows until the seed
 * runs, and an event added in a later release has none at all, so the
 * first save of either must create the row rather than silently doing
 * nothing.
 */
export async function saveNotificationSetting(
  _prev: NotificationSettingState,
  formData: FormData,
): Promise<NotificationSettingState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const parsed = schema.safeParse({
    eventKey: String(formData.get("eventKey") ?? ""),
    isEnabled: formData.get("isEnabled") === "on",
    notifyOwner: formData.get("notifyOwner") === "on",
    titleTemplate: String(formData.get("titleTemplate") ?? ""),
    bodyTemplate: String(formData.get("bodyTemplate") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const notifyRoles = formData.getAll("notifyRoles").map(String).filter(Boolean);

  const supabase = await createClient();
  const { error } = await supabase.from("notification_settings").upsert(
    {
      event_key: parsed.data.eventKey,
      is_enabled: parsed.data.isEnabled,
      notify_roles: notifyRoles.length > 0 ? notifyRoles : null,
      notify_owner: parsed.data.notifyOwner,
      // Only in-app is delivered today; see the schema comment. Written
      // explicitly so a row created here matches one created by the seed.
      channels: ["in_app"],
      title_template: parsed.data.titleTemplate,
      body_template: parsed.data.bodyTemplate,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_key" },
  );
  if (error) return { error: error.message };

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "notification_setting.update",
    entityType: "notification_settings",
    after: { ...parsed.data, notifyRoles },
  });

  revalidatePath("/settings/notifications");
  return { success: "Saved." };
}
