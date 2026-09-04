"use server";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import {
  getIntegrationCredentials,
  hasIntegrationCredential,
  setIntegrationCredential,
} from "@/lib/integrations/credentials";
import { MetaGraphApiError } from "@/lib/integrations/meta/graph-client";
import { getPhoneNumberInfo } from "@/lib/integrations/whatsapp/client";
import { createClient } from "@/lib/supabase/server";

export interface WhatsAppFormState {
  error?: string;
  success?: string;
}

/**
 * One WhatsApp Business API number for the whole institute.
 *
 * Not one per counsellor, which is what this screen used to manage: a
 * number registered to the Cloud API can no longer be used in the
 * WhatsApp Business app, and AFD's counsellors keep those apps on their
 * own phones. So the CRM owns exactly one number, every message it sends
 * carries the institute's name, and who sent what is recorded in
 * `whatsapp_messages.sent_by` rather than implied by which number it left
 * from. See docs/DECISIONS.md.
 *
 * `waba_id` is the WhatsApp Business Account the number sits under — it
 * is the node message templates live on, so template management needs it
 * and sending does not.
 */
const WHATSAPP_KEYS = ["app_secret", "verify_token", "access_token", "phone_number_id", "waba_id"] as const;
type WhatsAppKey = (typeof WHATSAPP_KEYS)[number];

const KEY_LABELS: Record<WhatsAppKey, string> = {
  app_secret: "App Secret",
  verify_token: "Verify Token",
  access_token: "Access Token",
  phone_number_id: "Phone Number ID",
  waba_id: "WhatsApp Business Account ID",
};

/** Same "every field optional per submit, blank means leave as-is" contract as the Meta/Google credentials forms. */
export async function saveWhatsAppCredentials(_prevState: WhatsAppFormState, formData: FormData): Promise<WhatsAppFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const updatedKeys: string[] = [];
  for (const key of WHATSAPP_KEYS) {
    const raw = formData.get(key);
    if (typeof raw === "string" && raw.trim()) {
      await setIntegrationCredential("whatsapp", key, raw.trim());
      updatedKeys.push(key);
    }
  }

  if (updatedKeys.length === 0) {
    return { error: "Nothing to save — every field was left blank." };
  }

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "integration.credentials_update",
    entityType: "integration_credentials",
    after: { provider: "whatsapp", updatedKeys },
  });

  return { success: `Saved ${updatedKeys.map((k) => KEY_LABELS[k as WhatsAppKey]).join(", ")}.` };
}

export interface WhatsAppConnectionStatus {
  configured: Record<WhatsAppKey, boolean>;
}

export async function getWhatsAppConnectionStatus(): Promise<WhatsAppConnectionStatus> {
  const configured = Object.fromEntries(
    await Promise.all(WHATSAPP_KEYS.map(async (key) => [key, await hasIntegrationCredential("whatsapp", key)] as const)),
  ) as Record<WhatsAppKey, boolean>;
  return { configured };
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
}

/** Confirms the connected number is real and reachable with the stored access token — without ever echoing either back to the browser. */
export async function testWhatsAppConnection(): Promise<TestConnectionResult> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { ok: false, message: "You don't have permission to do that." };
  }

  const { access_token: accessToken, phone_number_id: phoneNumberId } =
    await getIntegrationCredentials("whatsapp", ["access_token", "phone_number_id"]);
  if (!phoneNumberId || !accessToken) {
    return { ok: false, message: "Set an access token and a phone number id first." };
  }

  try {
    const info = await getPhoneNumberInfo(phoneNumberId, accessToken);
    return {
      ok: true,
      message: `Connected — ${info.display_phone_number ?? phoneNumberId} (${info.verified_name ?? "unverified name"}).`,
    };
  } catch (err) {
    const message =
      err instanceof MetaGraphApiError
        ? `WhatsApp rejected the request: ${err.message}`
        : "Could not reach the WhatsApp Cloud API.";
    return { ok: false, message };
  }
}
