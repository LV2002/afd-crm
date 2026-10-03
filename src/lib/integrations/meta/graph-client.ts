import type { MetaLeadgenResponse } from "./map-lead-fields";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export class MetaGraphApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "MetaGraphApiError";
  }
}

/**
 * Meta's leadgen webhook notification carries only a `leadgen_id` — the
 * actual answers (name, phone, email, custom questions) have to be
 * fetched separately with a Page access token. This is the one network
 * call in the whole ingestion path, deliberately kept as a thin wrapper
 * around `fetch` so the actual field-mapping logic
 * (`map-lead-fields.ts`) stays pure and unit-testable without it.
 */
export async function fetchMetaLead(leadgenId: string, pageAccessToken: string): Promise<MetaLeadgenResponse> {
  const url = new URL(`${GRAPH_BASE_URL}/${leadgenId}`);
  url.searchParams.set("fields", "field_data,form_id,ad_id,adset_id,campaign_id,created_time");
  url.searchParams.set("access_token", pageAccessToken);

  const response = await fetch(url.toString());
  const body = await response.json();

  if (!response.ok) {
    throw new MetaGraphApiError(`Meta Graph API returned ${response.status} fetching lead ${leadgenId}`, response.status, body);
  }

  return body as MetaLeadgenResponse;
}

export interface MetaTokenDebugInfo {
  isValid: boolean;
  appId?: string;
  scopes?: string[];
  expiresAt?: number;
}

/** Used by the "Test connection" button in Settings — confirms a token is real and shows what it can actually do, without ever echoing the token itself back to the browser. */
export async function debugMetaToken(accessToken: string, appAccessToken: string): Promise<MetaTokenDebugInfo> {
  const url = new URL(`${GRAPH_BASE_URL}/debug_token`);
  url.searchParams.set("input_token", accessToken);
  url.searchParams.set("access_token", appAccessToken);

  const response = await fetch(url.toString());
  const body = await response.json();

  if (!response.ok) {
    throw new MetaGraphApiError(`Meta Graph API returned ${response.status} debugging the token`, response.status, body);
  }

  const data = body.data ?? {};
  return {
    isValid: Boolean(data.is_valid),
    appId: data.app_id,
    scopes: data.scopes,
    expiresAt: data.expires_at,
  };
}

export interface MetaPageIdentity {
  id: string;
  name: string;
}

/**
 * Which Page a Page access token belongs to.
 *
 * A Page token's `/me` is the Page itself, not a person — so this both
 * identifies the Page and proves the stored token really is a Page token
 * rather than a User token, which is the single easiest mistake to make
 * when generating one and is invisible afterwards.
 */
export async function fetchMetaPageIdentity(pageAccessToken: string): Promise<MetaPageIdentity> {
  const url = new URL(`${GRAPH_BASE_URL}/me`);
  url.searchParams.set("fields", "id,name");
  url.searchParams.set("access_token", pageAccessToken);

  const response = await fetch(url.toString());
  const body = await response.json();

  if (!response.ok) {
    throw new MetaGraphApiError(
      `Meta Graph API returned ${response.status} identifying the Page`,
      response.status,
      body,
    );
  }
  return { id: String(body.id), name: String(body.name ?? "") };
}

/**
 * Subscribe the Page to this app's `leadgen` notifications.
 *
 * There are TWO switches behind Meta lead delivery and they are in
 * different places. Subscribing the APP to the `leadgen` field (done once,
 * in the App Dashboard) says "this app wants leadgen events". Subscribing
 * the PAGE to the app — this call — says "this Page will send its events
 * to that app". Both have to be on.
 *
 * With only the first, Meta accepts the webhook, verifies it, shows it as
 * subscribed, and delivers nothing. No error, no log, no failed request to
 * find: the enquiries simply never arrive. It is the most common reason a
 * correctly built Lead Ads integration produces silence, and the hardest
 * to diagnose precisely because nothing is wrong anywhere you would look.
 *
 * Doing it from here rather than in Meta's UI because the CRM already
 * holds the Page token, which is the only thing the call needs.
 */
export async function subscribePageToLeadgen(
  pageId: string,
  pageAccessToken: string,
): Promise<void> {
  const url = new URL(`${GRAPH_BASE_URL}/${pageId}/subscribed_apps`);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      subscribed_fields: "leadgen",
      access_token: pageAccessToken,
    }),
  });
  const body = await response.json();

  if (!response.ok || body?.success === false) {
    throw new MetaGraphApiError(
      `Meta Graph API returned ${response.status} subscribing the Page`,
      response.status,
      body,
    );
  }
}

/** The fields this app is currently subscribed to on the Page — the proof the switch is on. */
export async function fetchPageSubscribedFields(
  pageId: string,
  pageAccessToken: string,
): Promise<string[]> {
  const url = new URL(`${GRAPH_BASE_URL}/${pageId}/subscribed_apps`);
  url.searchParams.set("access_token", pageAccessToken);

  const response = await fetch(url.toString());
  const body = await response.json();

  if (!response.ok) {
    throw new MetaGraphApiError(
      `Meta Graph API returned ${response.status} reading the Page's subscriptions`,
      response.status,
      body,
    );
  }

  const apps = Array.isArray(body.data) ? body.data : [];
  return apps.flatMap((app: { subscribed_fields?: unknown }) =>
    Array.isArray(app.subscribed_fields) ? (app.subscribed_fields as string[]) : [],
  );
}
