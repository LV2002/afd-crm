"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Marking your own notifications read, or dismissing one.
 *
 * These run through the RLS-bound Supabase client on purpose, unlike the
 * writes in `notify.ts`. The `notifications_update` policy is
 * `recipient_id = auth.uid()` on both the USING and the WITH CHECK side,
 * so the database refuses to let one person mark another's mail read — or
 * to hand a row to somebody else on the way past. No id-ownership check
 * here to forget or get wrong.
 */

export async function markNotificationRead(notificationId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .is("read_at", null);

  revalidatePath("/notifications");
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null)
    .is("deleted_at", null);

  revalidatePath("/notifications");
}

/**
 * Dismissing one. Soft, like everything else here (CLAUDE.md § 5): the row
 * stays, the SELECT policy stops returning it.
 */
export async function dismissNotification(notificationId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", notificationId);

  revalidatePath("/notifications");
}
