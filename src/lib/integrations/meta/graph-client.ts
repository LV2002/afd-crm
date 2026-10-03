import type { MetaLeadgenResponse } from "./map-lead-fields";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export class MetaGraphApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`${message}${metaErrorDetail(body)}`);
    this.name = "MetaGraphApiError";
  }
}

/**
 * What Meta actually said, appended to our own description of the call.
 *
 * Meta puts a genuinely useful sentence in `error.message` — "(#200)
 * Requires pages_manage_metadata permission", "Object with ID … does not
 * exist" — and this client used to discard all of it, reporting only
 * "returned 400". That is the same failure as a migration that exits 1
 * without saying why: the platform told us, and we threw it away, and
 * then somebody spent an afternoon guessing.
 *
 * `error_user_msg` is Meta's own plain-English version where it exists,
 * and is worth more than the developer string, so it goes first.
 */
function metaErrorDetail(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const error = (body as { error?: Record<string, unknown> }).error;
  if (!error) return "";

  const parts: string[] = [];
  const userMessage = error.error_user_msg;
  if (typeof userMessage === "string" && userMessage) parts.push(userMessage);

  const message = error.message;
  if (typeof message === "string" && message && message !== userMessage) parts.push(message);

  const code = error.code;
  const subcode = error.error_subcode;
  const codes = [
    typeof code === "number" || typeof code === "string" ? `code ${code}` : null,
    typeof subcode === "number" || typeof subcode === "string" ? `subcode ${subcode}` : null,
  ].filter(Boolean);
  if (codes.length > 0) parts.push(`(${codes.join(", ")})`);

  return parts.length > 0 ? ` — ${parts.join(" ")}` : "";
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
  /** "USER" | "PAGE" — the distinction nothing else in Meta's UI makes visible. */
  type?: string;
  /** The user or Page the token speaks for. */
  profileId?: string;
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
    type: data.type,
    profileId: data.profile_id ?? data.user_id,
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


export interface MetaManagedPage {
  id: string;
  name: string;
  accessToken: string;
}

/**
 * The Pages a USER token can act for, each with its own Page token.
 *
 * This is the escape hatch from the single most common dead end in a Meta
 * setup. A User token and a Page token are both opaque strings, are
 * generated two clicks apart, and look identical once pasted into a
 * settings field — but only a Page token can subscribe a Page to leads.
 * Save the wrong one and Meta answers
 * `Object with ID … does not exist (code 100, subcode 33)`, naming an
 * app-scoped user id that means nothing to the person reading it.
 *
 * `/me/accounts` turns the wrong token into the right one, which is
 * better than sending somebody back to a UI that already defeated them.
 *
 * Requires `pages_show_list` on the user token; without it the list comes
 * back empty rather than erroring, so callers must treat empty as
 * "cannot tell" and say so.
 */
export async function fetchMetaPagesForUser(userAccessToken: string): Promise<MetaManagedPage[]> {
  const url = new URL(`${GRAPH_BASE_URL}/me/accounts`);
  url.searchParams.set("fields", "id,name,access_token");
  url.searchParams.set("access_token", userAccessToken);

  const response = await fetch(url.toString());
  const body = await response.json();

  if (!response.ok) {
    throw new MetaGraphApiError(
      `Meta Graph API returned ${response.status} listing the Pages this token manages`,
      response.status,
      body,
    );
  }

  const pages = Array.isArray(body.data) ? body.data : [];
  return pages
    .filter((page: { access_token?: unknown }) => typeof page.access_token === "string")
    .map((page: { id: unknown; name: unknown; access_token: string }) => ({
      id: String(page.id),
      name: String(page.name ?? ""),
      accessToken: page.access_token,
    }));
}
