"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { paymentReminderRules } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

export interface ReminderRuleState {
  error?: string;
  success?: string;
}

/**
 * Adds or edits one rung of the chasing ladder.
 *
 * A WhatsApp rung with no template is refused here as well as by a check
 * constraint: the constraint stops bad data, this stops somebody saving a
 * rung that would fail silently every night at 3am.
 */
export async function saveReminderRule(
  _prev: ReminderRuleState,
  formData: FormData,
): Promise<ReminderRuleState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to change reminders." };
  }

  const ruleId = String(formData.get("ruleId") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();
  const channel = String(formData.get("channel") ?? "notification");
  const templateName = String(formData.get("templateName") ?? "").trim() || null;
  const templateLanguage = String(formData.get("templateLanguage") ?? "").trim() || "en_US";
  const isActive = formData.get("isActive") !== "off";

  if (!name) return { error: "Give the rung a name." };
  if (channel !== "notification" && channel !== "whatsapp") return { error: "Unknown channel." };
  if (channel === "whatsapp" && !templateName) {
    return { error: "A WhatsApp rung needs an approved template name, or it fails every night." };
  }

  const daysRaw = String(formData.get("daysAfterDue") ?? "").trim();
  const daysAfterDue = Number(daysRaw);
  if (daysRaw === "" || !Number.isInteger(daysAfterDue)) {
    return { error: "Days must be a whole number. Use a negative number to remind before it's due." };
  }
  if (daysAfterDue < -365 || daysAfterDue > 365) {
    return { error: "Keep the timing within a year either side of the due date." };
  }

  const values = { name, daysAfterDue, channel, templateName, templateLanguage, isActive };

  let savedId: string;
  if (ruleId) {
    const [existing] = await db
      .select({ id: paymentReminderRules.id })
      .from(paymentReminderRules)
      .where(and(eq(paymentReminderRules.id, ruleId), isNull(paymentReminderRules.deletedAt)));
    if (!existing) return { error: "That reminder no longer exists." };
    await db
      .update(paymentReminderRules)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(paymentReminderRules.id, ruleId));
    savedId = ruleId;
  } else {
    const [created] = await db
      .insert(paymentReminderRules)
      .values(values)
      .returning({ id: paymentReminderRules.id });
    savedId = created.id;
  }

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: ruleId ? "payment_reminder.update" : "payment_reminder.create",
    entityType: "payment_reminder_rules",
    entityId: savedId,
    after: values,
  });

  revalidatePath("/settings/payment-reminders");
  return { success: ruleId ? "Saved." : `Added "${name}".` };
}

/**
 * Retires a rung. Soft-deleted, never removed: `payment_reminders_sent`
 * points at it, and those rows are the record of what a student was
 * actually told (CLAUDE.md § Non-negotiables 5).
 */
export async function deleteReminderRule(
  _prev: ReminderRuleState,
  formData: FormData,
): Promise<ReminderRuleState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to change reminders." };
  }

  const ruleId = String(formData.get("ruleId") ?? "").trim();
  if (!ruleId) return { error: "Missing reminder reference." };

  const updated = await db
    .update(paymentReminderRules)
    .set({ deletedAt: new Date(), isActive: false })
    .where(and(eq(paymentReminderRules.id, ruleId), isNull(paymentReminderRules.deletedAt)))
    .returning({ id: paymentReminderRules.id, name: paymentReminderRules.name });

  if (updated.length === 0) return { error: "That reminder no longer exists." };

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "payment_reminder.delete",
    entityType: "payment_reminder_rules",
    entityId: ruleId,
    before: { name: updated[0].name },
  });

  revalidatePath("/settings/payment-reminders");
  return { success: `Removed "${updated[0].name}".` };
}
