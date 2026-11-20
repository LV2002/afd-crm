"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { whatsappAutoReplies } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

export interface AutoReplyState {
  error?: string;
  success?: string;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveAutoReply(_prev: AutoReplyState, formData: FormData): Promise<AutoReplyState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) return { error: "You don't have permission to do that." };

  const kind = String(formData.get("kind") ?? "");
  if (kind !== "greeting" && kind !== "away") return { error: "Unknown message." };
  const message = String(formData.get("message") ?? "").trim();
  if (message.length > 1024) return { error: "Keep it under 1024 characters." };
  const enabled = formData.get("enabled") === "on";
  if (enabled && !message) return { error: "Write the message before switching it on." };

  const days = formData.getAll("days").map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const opensAt = String(formData.get("opensAt") ?? "09:00");
  const closesAt = String(formData.get("closesAt") ?? "18:00");
  if (kind === "away") {
    if (!TIME.test(opensAt) || !TIME.test(closesAt)) return { error: "Use times like 09:00." };
    if (opensAt >= closesAt) return { error: "Opening time must be before closing time." };
    if (days.length === 0 && enabled) return { error: "Pick at least one open day." };
  }

  await db
    .update(whatsappAutoReplies)
    .set(
      kind === "away"
        ? { enabled, message, days, opensAt, closesAt, updatedAt: new Date(), updatedBy: user.id }
        : { enabled, message, updatedAt: new Date(), updatedBy: user.id },
    )
    .where(eq(whatsappAutoReplies.kind, kind));

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "whatsapp.auto_reply_update",
    entityType: "whatsapp_auto_replies",
    entityId: null,
    after: { kind, enabled },
  });
  revalidatePath("/whatsapp/auto-replies");
  return { success: "Saved." };
}
