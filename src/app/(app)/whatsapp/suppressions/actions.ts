"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { normalizePhone } from "@/lib/identity/normalize-phone";
import { releasePhone, suppressPhone } from "@/lib/whatsapp/opt-out";
import { createClient } from "@/lib/supabase/server";

export interface SuppressionFormState {
  error?: string;
  success?: string;
}

/**
 * Records an opt-out somebody gave in person, on a call, or by email.
 *
 * Runs on the direct db client with the permission checked here, the same
 * shape as the other cross-cutting writes: the webhook writes these rows
 * with no session at all, and having one code path rather than two is
 * what stops the two disagreeing about what "suppressed" means.
 */
export async function addSuppression(
  _prevState: SuppressionFormState,
  formData: FormData,
): Promise<SuppressionFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) {
    return { error: "You don't have permission to do that." };
  }

  const raw = String(formData.get("phone") ?? "").trim();
  const phone = normalizePhone(raw);
  if (!phone) {
    return { error: "That doesn't look like a phone number. Include the country code." };
  }
  const reason = String(formData.get("reason") ?? "").trim();

  const added = await suppressPhone(db, {
    phone,
    reason: reason || "Recorded by hand",
    source: "manual",
    createdBy: user.id,
  });

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "whatsapp.suppression_add",
    entityType: "whatsapp_suppressions",
    after: { phone, reason: reason || null, source: "manual" },
  });

  revalidatePath("/whatsapp/suppressions");
  return {
    success: added
      ? `${phone} will no longer receive WhatsApp messages from the CRM.`
      : `${phone} was already opted out — nothing changed.`,
  };
}

/** Lifts an opt-out. The row stays, marked released, so the history survives. */
export async function releaseSuppression(phone: string): Promise<SuppressionFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) {
    return { error: "You don't have permission to do that." };
  }

  const released = await releasePhone(db, { phone, releasedBy: user.id });
  if (!released) return { error: "That number isn't currently opted out." };

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "whatsapp.suppression_release",
    entityType: "whatsapp_suppressions",
    after: { phone },
  });

  revalidatePath("/whatsapp/suppressions");
  return { success: `${phone} can be messaged again.` };
}
