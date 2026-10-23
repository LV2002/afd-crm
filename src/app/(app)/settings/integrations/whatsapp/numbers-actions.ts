"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { whatsappNumbers } from "@/lib/db/schema";
import { getIntegrationCredential } from "@/lib/integrations/credentials";
import { createClient } from "@/lib/supabase/server";
import { clearAllWhatsAppMessages } from "@/lib/whatsapp/clear-messages";
import { insertOrReviveNumber } from "@/lib/whatsapp/register-number";

export interface NumberFormState {
  error?: string;
  success?: string;
}

/**
 * Registers or updates one of the institute's WhatsApp numbers.
 *
 * The number itself is created in Meta, not here. What this records is
 * what the CRM needs to know about it: which person's phone it is, and
 * whether an inbound message from a stranger may become a lead.
 *
 * That second question is the whole reason this table exists. On the
 * institute's broadcast number the answer is no — a reply there is
 * somebody who pressed a button on a campaign. On a counsellor's own
 * coexistence number it is yes, because a stranger asking about NIFT
 * coaching is the highest-intent enquiry the institute gets.
 */
export async function saveWhatsAppNumber(
  _prev: NumberFormState,
  formData: FormData,
): Promise<NumberFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const id = String(formData.get("id") ?? "").trim() || null;
  const phoneNumberId = String(formData.get("phoneNumberId") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const displayPhoneNumber = String(formData.get("displayPhoneNumber") ?? "").trim() || null;
  const counsellorId = String(formData.get("counsellorId") ?? "").trim() || null;
  const createsLeads = formData.get("createsLeads") === "on";

  if (!phoneNumberId) {
    return { error: "Paste the Phone number ID from Meta — it is the only thing a webhook names." };
  }
  if (!label) return { error: "Give it a label you will recognise: whose phone, or which desk." };

  /*
    One API number, and it is the one in Credentials. Everything registered
    here is a Coexistence number — a counsellor's own phone — so a Phone
    number ID that matches the API number is refused with a pointer, rather
    than registering the same line twice under two different sets of rules.
  */
  const apiNumberId = await getIntegrationCredential("whatsapp", "phone_number_id");
  if (apiNumberId && apiNumberId === phoneNumberId) {
    return {
      error:
        "That is the Business API number — it is set in Credentials above, and there is only one. Numbers listed here are Coexistence numbers (a counsellor's own phone).",
    };
  }
  if (!counsellorId) {
    return {
      error:
        "A Coexistence number needs an owner. Messages sent from the phone are attributed to them, and leads from it are assigned to them.",
    };
  }

  const values = {
    phoneNumberId,
    label,
    displayPhoneNumber,
    mode: "coexistence",
    counsellorId,
    createsLeads,
  } as const;

  if (id) {
    const [existing] = await db
      .select({ id: whatsappNumbers.id })
      .from(whatsappNumbers)
      .where(and(eq(whatsappNumbers.id, id), isNull(whatsappNumbers.deletedAt)));
    if (!existing) return { error: "That number is no longer registered." };

    // A number registered as API-only before this screen was Coexistence-only
    // keeps that mode; saving other details must not silently convert it.
    const [current] = await db
      .select({ mode: whatsappNumbers.mode })
      .from(whatsappNumbers)
      .where(eq(whatsappNumbers.id, id));
    await db
      .update(whatsappNumbers)
      .set({ ...values, mode: current?.mode ?? values.mode, updatedAt: new Date() })
      .where(eq(whatsappNumbers.id, id));
  } else {
    const [clash] = await db
      .select({ id: whatsappNumbers.id, label: whatsappNumbers.label })
      .from(whatsappNumbers)
      .where(and(eq(whatsappNumbers.phoneNumberId, phoneNumberId), isNull(whatsappNumbers.deletedAt)));
    if (clash) {
      return { error: `That Phone number ID is already registered as "${clash.label}".` };
    }

    await insertOrReviveNumber(values);
  }

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: id ? "whatsapp_number.update" : "whatsapp_number.create",
    entityType: "whatsapp_numbers",
    entityId: id ?? undefined,
    after: { ...values },
  });

  revalidatePath("/settings/integrations/whatsapp");
  return { success: id ? `Saved ${label}.` : `Registered ${label}.` };
}

/** Stops a number being processed, without losing what it already brought in. */
export async function setWhatsAppNumberActive(
  id: string,
  isActive: boolean,
): Promise<NumberFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const [row] = await db
    .select({ label: whatsappNumbers.label })
    .from(whatsappNumbers)
    .where(and(eq(whatsappNumbers.id, id), isNull(whatsappNumbers.deletedAt)));
  if (!row) return { error: "That number is no longer registered." };

  await db
    .update(whatsappNumbers)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(whatsappNumbers.id, id));

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "whatsapp_number.update",
    entityType: "whatsapp_numbers",
    entityId: id,
    after: { isActive },
  });

  revalidatePath("/settings/integrations/whatsapp");
  return {
    success: isActive
      ? `${row.label} is live again.`
      : `${row.label} is off. Its deliveries are still recorded but nothing is processed from them.`,
  };
}

/**
 * Unregisters a number.
 *
 * Soft, like everything else. The messages it brought in stay on their
 * leads — a conversation does not stop having happened because somebody
 * tidied up a settings screen.
 */
export async function deleteWhatsAppNumber(id: string): Promise<NumberFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const [row] = await db
    .select({ label: whatsappNumbers.label })
    .from(whatsappNumbers)
    .where(and(eq(whatsappNumbers.id, id), isNull(whatsappNumbers.deletedAt)));
  if (!row) return { error: "That number is no longer registered." };

  await db
    .update(whatsappNumbers)
    .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
    .where(eq(whatsappNumbers.id, id));

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "whatsapp_number.delete",
    entityType: "whatsapp_numbers",
    entityId: id,
    before: { label: row.label },
  });

  revalidatePath("/settings/integrations/whatsapp");
  return { success: `Unregistered ${row.label}. Its messages stay on their leads.` };
}

/**
 * Hides every WhatsApp message so the inbox starts empty.
 *
 * Asks for the word CLEAR to be typed, because the button that does this
 * sits on a settings page people visit while fixing something else.
 * Soft: the rows keep their `deleted_at` and are recoverable, and the
 * audit row says how many were hidden and by whom.
 */
export async function clearWhatsAppMessages(
  _prev: NumberFormState,
  formData: FormData,
): Promise<NumberFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "CLEAR") {
    return { error: "Type CLEAR to confirm." };
  }

  const hidden = await clearAllWhatsAppMessages();

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "whatsapp_messages.cleared",
    entityType: "whatsapp_messages",
    after: { hidden },
  });

  revalidatePath("/settings/integrations/whatsapp");
  revalidatePath("/whatsapp");
  revalidatePath("/leads");
  return { success: `Hid ${hidden} ${hidden === 1 ? "message" : "messages"}. The inbox starts empty.` };
}
