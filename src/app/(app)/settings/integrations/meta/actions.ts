"use server";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import {
  getIntegrationCredentials,
  hasIntegrationCredential,
  setIntegrationCredential,
} from "@/lib/integrations/credentials";
import { debugMetaToken, MetaGraphApiError } from "@/lib/integrations/meta/graph-client";
import { createClient } from "@/lib/supabase/server";

export interface MetaFormState {
  error?: string;
  success?: string;
}

const META_KEYS = [
  "app_id",
  "app_secret",
  "verify_token",
  "page_access_token",
  "ads_access_token",
  "ad_account_id",
] as const;
type MetaKey = (typeof META_KEYS)[number];

const KEY_LABELS: Record<MetaKey, string> = {
  app_id: "App ID",
  app_secret: "App Secret",
  verify_token: "Verify Token",
  page_access_token: "Page Access Token",
  ads_access_token: "Ads Access Token",
  ad_account_id: "Ad Account ID",
};

/**
 * Every field is optional per submit — an admin rotating just the Page
 * Access Token shouldn't have to re-type the App Secret. A blank field
 * means "leave whatever's already stored," never "clear it"; there's no
 * way to clear a credential from this form on purpose (deleting a live
 * integration's credential is destructive enough to not want a stray
 * empty-field submit to do it by accident).
 */
export async function saveMetaCredentials(_prevState: MetaFormState, formData: FormData): Promise<MetaFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const updatedKeys: string[] = [];
  for (const key of META_KEYS) {
    const raw = formData.get(key);
    if (typeof raw === "string" && raw.trim()) {
      await setIntegrationCredential("meta", key, raw.trim());
      updatedKeys.push(key);
    }
  }

  if (updatedKeys.length === 0) {
    return { error: "Nothing to save — every field was left blank." };
  }

  const supabase = await createClient();
  // Deliberately never logs the values themselves, only which keys changed.
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "integration.credentials_update",
    entityType: "integration_credentials",
    after: { provider: "meta", updatedKeys },
  });

  return { success: `Saved ${updatedKeys.map((k) => KEY_LABELS[k as MetaKey]).join(", ")}.` };
}

export interface MetaConnectionStatus {
  configured: Record<MetaKey, boolean>;
}

export async function getMetaConnectionStatus(): Promise<MetaConnectionStatus> {
  const configured = Object.fromEntries(
    await Promise.all(META_KEYS.map(async (key) => [key, await hasIntegrationCredential("meta", key)] as const)),
  ) as Record<MetaKey, boolean>;
  return { configured };
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
}

/** Confirms one token is real, issued by this app, and not expired — never returns the token itself, only what Meta says about it. */
async function checkToken(token: string, appId: string, appSecret: string, label: string): Promise<string> {
  const info = await debugMetaToken(token, `${appId}|${appSecret}`);
  if (!info.isValid) return `${label}: no longer valid — generate a new one.`;
  if (info.appId && info.appId !== appId) return `${label}: issued by a different Meta app than the App ID configured here.`;
  const expiry = info.expiresAt ? (info.expiresAt === 0 ? "never expires" : `expires ${new Date(info.expiresAt * 1000).toLocaleDateString()}`) : "expiry unknown";
  return `${label}: valid, ${expiry}.`;
}

/**
 * Checks both tokens independently — Page Access Token (used by the Lead
 * Ads webhook to fetch a submitted lead's answers) and Ads Access Token
 * (used by the ad spend sync and retargeting sync, which need
 * ads_read/ads_management rather than page permissions) are genuinely
 * different tokens with different scopes, so "connected" isn't a single
 * yes/no here.
 */
export async function testMetaConnection(): Promise<TestConnectionResult> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { ok: false, message: "You don't have permission to do that." };
  }

  const {
    app_id: appId,
    app_secret: appSecret,
    page_access_token: pageAccessToken,
    ads_access_token: adsAccessToken,
  } = await getIntegrationCredentials("meta", ["app_id", "app_secret", "page_access_token", "ads_access_token"]);

  if (!appId || !appSecret || (!pageAccessToken && !adsAccessToken)) {
    return { ok: false, message: "Set App ID, App Secret, and at least one of Page/Ads Access Token first." };
  }

  try {
    const messages: string[] = [];
    if (pageAccessToken) messages.push(await checkToken(pageAccessToken, appId, appSecret, "Page Access Token"));
    if (adsAccessToken) messages.push(await checkToken(adsAccessToken, appId, appSecret, "Ads Access Token"));
    const ok = !messages.some((m) => m.includes("no longer valid") || m.includes("different Meta app"));
    return { ok, message: messages.join(" ") };
  } catch (err) {
    const message = err instanceof MetaGraphApiError ? `Meta rejected the request: ${err.message}` : "Could not reach Meta's API.";
    return { ok: false, message };
  }
}
