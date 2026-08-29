"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { profiles, rolePermissions } from "@/lib/db/schema";
import {
  getIntegrationCredential,
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

const WHATSAPP_KEYS = ["app_secret", "verify_token", "access_token"] as const;
type WhatsAppKey = (typeof WHATSAPP_KEYS)[number];

const KEY_LABELS: Record<WhatsAppKey, string> = {
  app_secret: "App Secret",
  verify_token: "Verify Token",
  access_token: "Access Token",
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

export interface CounsellorNumberRow {
  id: string;
  fullName: string;
  email: string;
  whatsappDisplayName: string | null;
  hasNumber: boolean;
}

/**
 * Everyone whose role currently grants `whatsapp.send` at any scope — the
 * "one number per counsellor" roster an admin assigns numbers to. Runs on
 * the direct db client: this settings screen is already gated on
 * `settings.manage`, and the join (profiles -> role_permissions) has no
 * corresponding RLS-friendly shape worth building just for this one admin
 * read, same reasoning as the Meta/Google credential actions.
 */
export async function getCounsellorsWithWhatsAppAccess(): Promise<CounsellorNumberRow[]> {
  const rows = await db
    .selectDistinct({
      id: profiles.id,
      fullName: profiles.fullName,
      email: profiles.email,
      whatsappDisplayName: profiles.whatsappDisplayName,
    })
    .from(profiles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, profiles.roleId))
    .where(eq(rolePermissions.permissionCode, "whatsapp.send"));

  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      hasNumber: await hasIntegrationCredential("whatsapp", "phone_number_id", row.id),
    })),
  );
}

export async function saveCounsellorNumber(_prevState: WhatsAppFormState, formData: FormData): Promise<WhatsAppFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const profileId = formData.get("profileId");
  const phoneNumberId = formData.get("phoneNumberId");
  const displayName = formData.get("displayName");
  if (typeof profileId !== "string" || !profileId) {
    return { error: "Missing counsellor." };
  }

  if (typeof phoneNumberId === "string" && phoneNumberId.trim()) {
    await setIntegrationCredential("whatsapp", "phone_number_id", phoneNumberId.trim(), profileId);
  }
  if (typeof displayName === "string") {
    await db.update(profiles).set({ whatsappDisplayName: displayName.trim() || null }).where(eq(profiles.id, profileId));
  }

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "integration.credentials_update",
    entityType: "integration_credentials",
    after: { provider: "whatsapp", scopeId: profileId, updatedKeys: ["phone_number_id"] },
  });

  revalidatePath("/settings/integrations/whatsapp");
  return { success: "Saved." };
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
}

/** Confirms one counsellor's assigned number is real and reachable with the org's access token — without ever echoing either back to the browser. */
export async function testCounsellorNumber(profileId: string): Promise<TestConnectionResult> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { ok: false, message: "You don't have permission to do that." };
  }

  const phoneNumberId = await getIntegrationCredential("whatsapp", "phone_number_id", profileId);
  const { access_token: accessToken } = await getIntegrationCredentials("whatsapp", ["access_token"]);
  if (!phoneNumberId || !accessToken) {
    return { ok: false, message: "Set an access token and a phone number id first." };
  }

  try {
    const info = await getPhoneNumberInfo(phoneNumberId, accessToken);
    return { ok: true, message: `Connected — ${info.display_phone_number ?? phoneNumberId} (${info.verified_name ?? "unverified name"}).` };
  } catch (err) {
    const message = err instanceof MetaGraphApiError ? `WhatsApp rejected the request: ${err.message}` : "Could not reach the WhatsApp Cloud API.";
    return { ok: false, message };
  }
}
