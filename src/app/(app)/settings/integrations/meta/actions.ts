"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { runAdSpendBackfill, type BackfillState } from "@/lib/integrations/ad-spend-backfill";
import { syncMetaAdSpend } from "@/lib/integrations/meta/sync-ad-spend";
import { can, getCurrentUser } from "@/lib/auth/session";
import { reportActionFailure } from "@/lib/errors/action-failure";
import {
  getIntegrationCredentials,
  hasIntegrationCredential,
  setIntegrationCredential,
} from "@/lib/integrations/credentials";
import {
  debugMetaToken,
  fetchMetaPageIdentity,
  fetchMetaPagesForUser,
  fetchPageSubscribedFields,
  MetaGraphApiError,
  subscribePageFields,
  PAGE_LEAD_FIELDS,
  PAGE_SUBSCRIBED_FIELDS,
} from "@/lib/integrations/meta/graph-client";
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
  "ig_user_id",
] as const;
type MetaKey = (typeof META_KEYS)[number];

const KEY_LABELS: Record<MetaKey, string> = {
  app_id: "App ID",
  app_secret: "App Secret",
  verify_token: "Verify Token",
  page_access_token: "Page Access Token",
  ads_access_token: "Ads Access Token",
  ad_account_id: "Ad Account ID",
  ig_user_id: "Instagram Account ID",
};

/**
 * Every field is optional per submit — an admin rotating just the Page
 * Access Token shouldn't have to re-type the App Secret. A blank field
 * means "leave whatever's already stored," never "clear it"; there's no
 * way to clear a credential from this form on purpose (deleting a live
 * integration's credential is destructive enough to not want a stray
 * empty-field submit to do it by accident).
 */
/**
 * Saving credentials must never cost the admin the screen.
 *
 * Every write here runs through AES-256-GCM keyed by
 * `INTEGRATION_ENCRYPTION_KEY`, and that key lives in the deploy
 * environment rather than the database. When it is missing — which it was
 * in production on 3 October — the encrypt call throws, the throw was
 * unhandled, and Settings -> Integrations -> Meta went blank mid-setup
 * with only a digest to show for it.
 *
 * The real message is shown rather than a generic one: this screen is
 * admin-only, and "INTEGRATION_ENCRYPTION_KEY is not set" is precisely
 * what the person reading it needs to know.
 */
export async function saveMetaCredentials(_prevState: MetaFormState, formData: FormData): Promise<MetaFormState> {
  try {
    return await runMetaCredentials(formData);
  } catch (error) {
    return {
      error: await reportActionFailure("action:saveMetaCredentials", error, {
        context: { provider: "meta" },
        fallback: "Could not save these credentials. The problem has been reported.",
        revealMessage: true,
      }),
    };
  }
}

async function runMetaCredentials(formData: FormData): Promise<MetaFormState> {
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
async function checkToken(
  token: string,
  appId: string,
  appSecret: string,
  label: string,
  /** "PAGE" for the Page Access Token. Left unset where either is fine. */
  expectedType?: "PAGE" | "USER",
): Promise<string> {
  const info = await debugMetaToken(token, `${appId}|${appSecret}`);
  if (!info.isValid) return `${label}: no longer valid — generate a new one.`;
  if (info.appId && info.appId !== appId) return `${label}: issued by a different Meta app than the App ID configured here.`;

  // Said here so it is caught by a Test connection rather than three steps
  // later by a Graph API refusal naming an app-scoped id. A User token and
  // a Page token are indistinguishable once saved, and only `debug_token`
  // knows which is which.
  if (expectedType && info.type && info.type.toUpperCase() !== expectedType) {
    return `${label}: this is a ${info.type.toUpperCase()} token, not a ${expectedType} token — "Subscribe this Page to leads" below can swap it for the right one.`;
  }

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
    if (pageAccessToken) messages.push(await checkToken(pageAccessToken, appId, appSecret, "Page Access Token", "PAGE"));
    if (adsAccessToken) messages.push(await checkToken(adsAccessToken, appId, appSecret, "Ads Access Token"));
    const ok = !messages.some((m) => m.includes("no longer valid") || m.includes("different Meta app") || m.includes("not a PAGE token"));
    return { ok, message: messages.join(" ") };
  } catch (err) {
    const message = err instanceof MetaGraphApiError ? `Meta rejected the request: ${err.message}` : "Could not reach Meta's API.";
    return { ok: false, message };
  }
}


/**
 * Turn on the second of Meta's two lead-delivery switches.
 *
 * Subscribing the APP to the `leadgen` field in the App Dashboard says
 * "this app wants leadgen events". Subscribing the PAGE to the app — this
 * — says "this Page will send its events to that app". Both must be on,
 * they live in different places, and with only the first Meta verifies
 * the webhook, reports it as subscribed, and delivers nothing: no error,
 * no failed request, no log. Just silence where the enquiries should be.
 *
 * A button rather than a step in a guide because the CRM already holds
 * the Page token, which is the only thing the call needs, and because a
 * manual step whose omission is invisible is a manual step that will be
 * omitted.
 *
 * It reads the subscription back afterwards rather than trusting the
 * write, since "Meta said OK" is exactly the reassurance that was
 * misleading in the first place.
 */
export async function subscribeMetaPage(): Promise<TestConnectionResult> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { ok: false, message: "You don't have permission to do that." };
  }

  const {
    app_id: appId,
    app_secret: appSecret,
    page_access_token: storedToken,
  } = await getIntegrationCredentials("meta", ["app_id", "app_secret", "page_access_token"]);

  if (!storedToken) {
    return { ok: false, message: "Save a Page Access Token first — this call is made with it." };
  }

  try {
    let pageToken = storedToken;
    let swappedFrom: string | null = null;

    /*
      Is this actually a Page token?

      A User token and a Page token are both opaque strings, generated two
      clicks apart, and indistinguishable once saved. Only a Page token can
      subscribe a Page. Meta's refusal names an app-scoped user id that
      means nothing to the reader, so the check happens here instead —
      `debug_token` says `type: USER` or `type: PAGE` outright.

      Needs the app credentials; without them we skip the check rather than
      refuse to try, because the subscribe call may well still work.
    */
    if (appId && appSecret) {
      const info = await debugMetaToken(storedToken, `${appId}|${appSecret}`);
      if (!info.isValid) {
        return { ok: false, message: "That Page Access Token is no longer valid — generate a new one." };
      }

      if (info.type && info.type.toUpperCase() !== "PAGE") {
        // Rather than send them back to the UI that produced the wrong
        // token, turn it into the right one.
        const pages = await fetchMetaPagesForUser(storedToken);

        if (pages.length === 0) {
          return {
            ok: false,
            message:
              "The token saved as Page Access Token is a User token, not a Page token, and it cannot list any Pages — it is missing the pages_show_list permission. Generate a new token that has it, or use the System User route in docs/ADS-SETUP.md 1.3.",
          };
        }
        if (pages.length > 1) {
          return {
            ok: false,
            message: `The token saved is a User token, not a Page token. It manages ${pages.length} Pages (${pages.map((p) => p.name).join(", ")}), so paste the Page Access Token for the one you want rather than having one picked for you.`,
          };
        }

        pageToken = pages[0].accessToken;
        swappedFrom = pages[0].name;
        await setIntegrationCredential("meta", "page_access_token", pageToken);
      }
    }

    const page = await fetchMetaPageIdentity(pageToken);
    /*
      Ask for everything, settle for leads.

      Meta rejects the entire call when the token lacks a permission any
      one field needs — a Page token without `pages_messaging` answers
      "(#200) To subscribe to the messages field, one of these permissions
      is needed: pages_messaging" and subscribes nothing at all. So a
      refusal is caught and retried with the lead field alone: a token that
      cannot do Instagram must not cost this institute its leads, which is
      what sending both fields unconditionally did.
    */
    let messagesRefusal: string | null = null;
    try {
      await subscribePageFields(page.id, pageToken, PAGE_SUBSCRIBED_FIELDS);
    } catch (err) {
      if (!(err instanceof MetaGraphApiError)) throw err;
      messagesRefusal = err.message;
      await subscribePageFields(page.id, pageToken, PAGE_LEAD_FIELDS);
    }

    const fields = await fetchPageSubscribedFields(page.id, pageToken);

    if (!fields.includes("leadgen")) {
      return {
        ok: false,
        message: `Meta accepted the request for "${page.name}" but still does not list leadgen as subscribed. Check the app is subscribed to the leadgen field in the App Dashboard.`,
      };
    }

    // Not a failure: leads are the job here and they are working. But
    // Instagram DMs are delivered on the Page's `messages` subscription,
    // so a Page that did not take it is the whole reason DMs are silent —
    // and silence is the one symptom this screen exists to explain.
    const messagesNote = fields.includes("messages")
      ? " Instagram DMs linked to this Page will arrive too."
      : messagesRefusal
        ? ` Leads are unaffected, but Instagram DMs will not arrive: Meta refused the messages subscription — ${messagesRefusal} Generate a Page Access Token that also has pages_messaging, instagram_basic and instagram_manage_messages, save it above, and press this again.`
        : " Instagram DMs will not arrive yet: Meta did not list `messages` as subscribed, which usually means the Instagram account is not linked to this Page.";

    const supabase = await createClient();
    await writeAuditLog(supabase, {
      actorId: user.id,
      action: "integration.page_subscribed",
      entityType: "integration_credentials",
      after: { provider: "meta", pageId: page.id, pageName: page.name, fields, swappedFromUserToken: swappedFrom !== null },
    });

    // Said plainly, because the stored credential changed underneath them.
    const swapNote = swappedFrom
      ? ` The token you had saved was a User token, so the Page token for "${swappedFrom}" was fetched and saved in its place.`
      : "";

    return {
      ok: true,
      message: `"${page.name}" is subscribed and will send leads here.${messagesNote}${swapNote}`,
    };
  } catch (err) {
    if (err instanceof MetaGraphApiError) {
      return { ok: false, message: `Meta rejected the request. ${err.message}` };
    }
    return { ok: false, message: "Could not reach Meta's API." };
  }
}

/**
 * **Import past ad spend**, Meta.
 *
 * The nightly sync keeps today's numbers right; this is for the history
 * that existed before the CRM did. One bounded chunk per press, walking
 * backwards from the oldest day already stored — see `backfillWindow()`
 * for why it is not one call for a whole year (a serverless function
 * killed at its time limit looks exactly like one that finished).
 */
export async function importPastMetaAdSpend(): Promise<BackfillState> {
  try {
    const { ad_account_id: adAccountId, ads_access_token: accessToken } =
      await getIntegrationCredentials("meta", ["ad_account_id", "ads_access_token"]);

    if (!adAccountId || !accessToken) {
      return {
        error:
          "Meta's Ads Access Token and Ad Account ID are not set yet. Spend cannot be read without them — enter both above and save first.",
      };
    }

    const state = await runAdSpendBackfill("meta", (since, until) =>
      syncMetaAdSpend(adAccountId, accessToken, since, until),
    );
    if (state.success) revalidatePath("/settings/integrations/meta");
    return state;
  } catch (error) {
    return {
      error: await reportActionFailure("action:importPastMetaAdSpend", error, {
        fallback: "Could not import that period. The problem has been reported.",
        // Meta's own sentence is the useful part — "(#190) token expired",
        // "unsupported get request" — and an admin is the one who can act
        // on it.
        revealMessage: true,
      }),
    };
  }
}
