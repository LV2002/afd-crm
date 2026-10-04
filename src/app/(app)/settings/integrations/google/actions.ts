"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { runAdSpendBackfill, type BackfillState } from "@/lib/integrations/ad-spend-backfill";
import { syncGoogleAdSpend } from "@/lib/integrations/google/sync-ad-spend";
import { can, getCurrentUser } from "@/lib/auth/session";
import { reportActionFailure } from "@/lib/errors/action-failure";
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
  "conversion_action",
] as const;
type GoogleKey = (typeof GOOGLE_KEYS)[number];

const KEY_LABELS: Record<GoogleKey, string> = {
  google_key: "Webhook Verify Key",
  client_id: "OAuth Client ID",
  client_secret: "OAuth Client Secret",
  refresh_token: "OAuth Refresh Token",
  developer_token: "Developer Token",
  customer_id: "Customer ID",
  conversion_action: "Conversion Action",
  login_customer_id: "Manager (Login) Customer ID",
};

/**
 * Same "every field optional per submit, blank means leave as-is, never
 * clear" contract as `saveMetaCredentials` — rotating one credential
 * (e.g. a re-issued refresh token) shouldn't force re-entering everything
 * else.
 */
/**
 * Saving credentials must never cost the admin the screen.
 *
 * Every write here runs through AES-256-GCM keyed by
 * `INTEGRATION_ENCRYPTION_KEY`, and that key lives in the deploy
 * environment rather than the database. When it is missing — which it was
 * in production on 3 October — the encrypt call throws, the throw was
 * unhandled, and Settings -> Integrations -> Google went blank mid-setup
 * with only a digest to show for it.
 *
 * The real message is shown rather than a generic one: this screen is
 * admin-only, and "INTEGRATION_ENCRYPTION_KEY is not set" is precisely
 * what the person reading it needs to know.
 */
export async function saveGoogleCredentials(_prevState: GoogleFormState, formData: FormData): Promise<GoogleFormState> {
  try {
    return await runGoogleCredentials(formData);
  } catch (error) {
    return {
      error: await reportActionFailure("action:saveGoogleCredentials", error, {
        context: { provider: "google" },
        fallback: "Could not save these credentials. The problem has been reported.",
        revealMessage: true,
      }),
    };
  }
}

async function runGoogleCredentials(formData: FormData): Promise<GoogleFormState> {
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

/**
 * **Import past ad spend**, Google. The twin of the Meta one, with the
 * extra OAuth hop every Google Ads call needs: the stored refresh token
 * buys a short-lived access token first.
 */
export async function importPastGoogleAdSpend(): Promise<BackfillState> {
  try {
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
      return {
        error:
          "Google Ads is not fully connected yet — the OAuth credentials, developer token and customer ID all have to be saved above before spend can be read.",
      };
    }

    const accessToken = await getGoogleAdsAccessToken(clientId, clientSecret, refreshToken);

    const state = await runAdSpendBackfill("google", (since, until) =>
      syncGoogleAdSpend(customerId, { developerToken, accessToken, loginCustomerId }, since, until),
    );
    if (state.success) revalidatePath("/settings/integrations/google");
    return state;
  } catch (error) {
    return {
      error: await reportActionFailure("action:importPastGoogleAdSpend", error, {
        fallback: "Could not import that period. The problem has been reported.",
        revealMessage: true,
      }),
    };
  }
}
