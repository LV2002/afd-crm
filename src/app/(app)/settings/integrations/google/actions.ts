"use server";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import {
  getIntegrationCredentials,
  hasIntegrationCredential,
  setIntegrationCredential,
} from "@/lib/integrations/credentials";
import { getGoogleAdsAccessToken, GoogleAdsApiError, searchGoogleAds } from "@/lib/integrations/google/ads-client";
import { createClient } from "@/lib/supabase/server";

export interface GoogleFormState {
  error?: string;
  success?: string;
}

const GOOGLE_KEYS = [
  "google_key",
  "client_id",
  "client_secret",
  "refresh_token",
  "developer_token",
  "customer_id",
  "login_customer_id",
] as const;
type GoogleKey = (typeof GOOGLE_KEYS)[number];

const KEY_LABELS: Record<GoogleKey, string> = {
  google_key: "Webhook Verify Key",
  client_id: "OAuth Client ID",
  client_secret: "OAuth Client Secret",
  refresh_token: "OAuth Refresh Token",
  developer_token: "Developer Token",
  customer_id: "Customer ID",
  login_customer_id: "Manager (Login) Customer ID",
};

/**
 * Same "every field optional per submit, blank means leave as-is, never
 * clear" contract as `saveMetaCredentials` — rotating one credential
 * (e.g. a re-issued refresh token) shouldn't force re-entering everything
 * else.
 */
export async function saveGoogleCredentials(_prevState: GoogleFormState, formData: FormData): Promise<GoogleFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const updatedKeys: string[] = [];
  for (const key of GOOGLE_KEYS) {
    const raw = formData.get(key);
    if (typeof raw === "string" && raw.trim()) {
      await setIntegrationCredential("google", key, raw.trim());
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
    after: { provider: "google", updatedKeys },
  });

  return { success: `Saved ${updatedKeys.map((k) => KEY_LABELS[k as GoogleKey]).join(", ")}.` };
}

export interface GoogleConnectionStatus {
  configured: Record<GoogleKey, boolean>;
}

export async function getGoogleConnectionStatus(): Promise<GoogleConnectionStatus> {
  const configured = Object.fromEntries(
    await Promise.all(GOOGLE_KEYS.map(async (key) => [key, await hasIntegrationCredential("google", key)] as const)),
  ) as Record<GoogleKey, boolean>;
  return { configured };
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
}

/**
 * Refreshes an access token from the stored refresh token, then runs the
 * smallest possible real query (`SELECT customer.id FROM customer`)
 * against the configured customer id — confirms all four pieces
 * (client id/secret, refresh token, developer token, customer id) are
 * mutually valid in one call, since any one of them being wrong fails this
 * exact request. Never echoes any credential back, only what Google says.
 */
export async function testGoogleConnection(): Promise<TestConnectionResult> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { ok: false, message: "You don't have permission to do that." };
  }

  const {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    developer_token: developerToken,
    customer_id: customerId,
    login_customer_id: loginCustomerId,
  } = await getIntegrationCredentials("google", [
    "client_id",
    "client_secret",
    "refresh_token",
    "developer_token",
    "customer_id",
    "login_customer_id",
  ]);

  if (!clientId || !clientSecret || !refreshToken || !developerToken || !customerId) {
    return { ok: false, message: "Set OAuth Client ID/Secret, Refresh Token, Developer Token, and Customer ID first." };
  }

  try {
    const accessToken = await getGoogleAdsAccessToken(clientId, clientSecret, refreshToken);
    await searchGoogleAds(customerId, { developerToken, accessToken, loginCustomerId }, "SELECT customer.id FROM customer LIMIT 1");
    return { ok: true, message: "Connected — Google Ads API accepted the credentials." };
  } catch (err) {
    const message = err instanceof GoogleAdsApiError ? `Google rejected the request: ${err.message}` : "Could not reach the Google Ads API.";
    return { ok: false, message };
  }
}
