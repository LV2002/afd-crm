import { MetaGraphApiError } from "../meta/graph-client";

// Same Graph API the Lead Ads/Insights clients use — the WhatsApp Cloud
// API is one product family with Meta's other Graph APIs, just a
// different node (`/{phone_number_id}/messages`) and permission set.
const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

interface SendMessageResponse {
  messages: Array<{ id: string }>;
}

async function postMessage(phoneNumberId: string, accessToken: string, body: Record<string, unknown>): Promise<string> {
  const response = await fetch(`${GRAPH_BASE_URL}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
  });
  const responseBody = await response.json();
  if (!response.ok) {
    throw new MetaGraphApiError(`WhatsApp Cloud API returned ${response.status} sending a message`, response.status, responseBody);
  }
  return (responseBody as SendMessageResponse).messages[0].id;
}

/**
 * `to` must be digits-only with country code, no leading '+' (Meta's
 * requirement — distinct from this system's own E.164-with-'+' storage
 * convention, so callers pass the lead's stored phone and this strips it).
 * Only usable within Meta's 24-hour customer service window (the lead
 * messaged first, or replied, within the last 24h) — outside it, Meta
 * rejects a free-form text send and a template must be used instead. That
 * rule is enforced by the caller (the send Server Action), not here: this
 * client is a thin, unopinionated wrapper, same shape as the Meta Lead Ads
 * Graph client.
 */
export async function sendTextMessage(phoneNumberId: string, accessToken: string, toE164: string, body: string): Promise<string> {
  return postMessage(phoneNumberId, accessToken, {
    to: toE164.replace(/\D/g, ""),
    type: "text",
    text: { body },
  });
}

/** Up to three tappable reply buttons. Only inside the 24-hour window. A tap arrives as an ordinary inbound message carrying the button's words. */
export async function sendReplyButtons(
  phoneNumberId: string,
  accessToken: string,
  toE164: string,
  input: { body: string; buttons: string[] },
): Promise<string> {
  return postMessage(phoneNumberId, accessToken, {
    to: toE164.replace(/\D/g, ""),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: input.body },
      action: { buttons: input.buttons.map((title, i) => ({ type: "reply", reply: { id: `btn_${i + 1}`, title } })) },
    },
  });
}

/** A message with a button that opens a list of up to ten choices. Only inside the 24-hour window. */
export async function sendListMessage(
  phoneNumberId: string,
  accessToken: string,
  toE164: string,
  input: { body: string; buttonText: string; rows: Array<{ title: string; description?: string }> },
): Promise<string> {
  return postMessage(phoneNumberId, accessToken, {
    to: toE164.replace(/\D/g, ""),
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: input.body },
      action: {
        button: input.buttonText,
        sections: [{ title: "Options", rows: input.rows.map((r, i) => ({ id: `row_${i + 1}`, title: r.title, ...(r.description ? { description: r.description } : {}) })) }],
      },
    },
  });
}

/**
 * Sends a file Meta fetches from a public https address, instead of one we
 * uploaded. Used by automations, which have no person to attach a file.
 */
export async function sendMediaByLink(
  phoneNumberId: string,
  accessToken: string,
  toE164: string,
  media: { kind: "image" | "document" | "video"; link: string; caption?: string; fileName?: string },
): Promise<string> {
  const payload: Record<string, unknown> = { link: media.link };
  if (media.caption) payload.caption = media.caption;
  if (media.kind === "document" && media.fileName) payload.filename = media.fileName;
  return postMessage(phoneNumberId, accessToken, {
    to: toE164.replace(/\D/g, ""),
    type: media.kind,
    [media.kind]: payload,
  });
}

/**
 * Puts a file on Meta's servers and returns the media id to send it by.
 *
 * The alternative — passing a public URL and letting Meta fetch it — is
 * not available here and would not be wanted if it were: the CRM's bucket
 * is private, and the only way to hand Meta a URL would be to mint a
 * signed one, which is a bearer token for that file given to a third party
 * and cached for as long as they like. Uploading the bytes directly keeps
 * the file's only public existence the one WhatsApp shows the recipient.
 *
 * The id is valid for 30 days and can be reused, which is what makes a
 * broadcast affordable: one upload, then the same id on every recipient's
 * message rather than the same file pushed a thousand times.
 */
export async function uploadMedia(
  phoneNumberId: string,
  accessToken: string,
  file: Blob,
  fileName: string,
): Promise<string> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  // Meta reads the type from the part, not from a separate field; getting
  // it wrong is a 400 rather than a wrong-looking message.
  form.append("type", file.type);
  form.append("file", file, fileName);

  const response = await fetch(`${GRAPH_BASE_URL}/${phoneNumberId}/media`, {
    method: "POST",
    // Deliberately no Content-Type header: fetch sets it with the
    // multipart boundary, and setting it by hand breaks the upload.
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const body = await response.json();
  if (!response.ok) {
    throw new MetaGraphApiError(
      `WhatsApp Cloud API returned ${response.status} uploading media`,
      response.status,
      body,
    );
  }
  const id = (body as { id?: string }).id;
  if (!id) {
    throw new MetaGraphApiError("WhatsApp accepted the upload but returned no media id", 502, body);
  }
  return id;
}

export interface WhatsAppMediaPayload {
  /** Meta's own message type — "image", "video", "audio" or "document". */
  kind: "image" | "video" | "audio" | "document";
  /** From `uploadMedia`. */
  mediaId: string;
  /** Shown under the media. Documents also take a filename. */
  caption?: string;
  fileName?: string;
}

/**
 * An image, video or document message. Same 24-hour customer service
 * window rule as `sendTextMessage`, enforced by the caller.
 */
export async function sendMediaMessage(
  phoneNumberId: string,
  accessToken: string,
  toE164: string,
  media: WhatsAppMediaPayload,
): Promise<string> {
  const payload: Record<string, unknown> = { id: media.mediaId };
  // Audio takes no caption; Meta rejects the field.
  if (media.caption && media.kind !== "audio") payload.caption = media.caption;
  // Only documents carry a filename; sending one on an image is rejected.
  if (media.kind === "document" && media.fileName) payload.filename = media.fileName;

  return postMessage(phoneNumberId, accessToken, {
    to: toE164.replace(/\D/g, ""),
    type: media.kind,
    [media.kind]: payload,
  });
}

export interface PhoneNumberInfo {
  display_phone_number?: string;
  verified_name?: string;
}

/** Used by the "Test connection" check in Settings — confirms a phone_number_id is real and reachable with the given access token, without ever sending a message. */
export async function getPhoneNumberInfo(phoneNumberId: string, accessToken: string): Promise<PhoneNumberInfo> {
  const url = new URL(`${GRAPH_BASE_URL}/${phoneNumberId}`);
  url.searchParams.set("fields", "display_phone_number,verified_name");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url.toString());
  const body = await response.json();
  if (!response.ok) {
    throw new MetaGraphApiError(`WhatsApp Cloud API returned ${response.status} looking up phone number ${phoneNumberId}`, response.status, body);
  }
  return body as PhoneNumberInfo;
}

/**
 * A template must already be approved in WhatsApp Manager under this
 * exact name/language before it can be sent — Meta rejects anything else.
 * `bodyParams`, if given, fill the template's `{{1}}`, `{{2}}`, ...
 * placeholders in order.
 */
export async function sendTemplateMessage(
  phoneNumberId: string,
  accessToken: string,
  toE164: string,
  templateName: string,
  languageCode: string,
  bodyParams?: string[],
  /**
   * Fills the template's media header. Only valid for a template whose
   * header was approved as IMAGE, VIDEO or DOCUMENT — Meta rejects a
   * header component on a text-header template, so the caller only passes
   * this when the operator attached a file.
   */
  headerMedia?:
    | { kind: "image" | "video" | "document"; mediaId: string }
    // A file WhatsApp fetches itself from a public https link, for a document
    // that differs per person (an admit card).
    | { kind: "document"; link: string; filename?: string },
): Promise<string> {
  const components: Array<Record<string, unknown>> = [];
  if (headerMedia) {
    components.push({
      type: "header",
      parameters: [
        {
          type: headerMedia.kind,
          [headerMedia.kind]:
            "link" in headerMedia
              ? { link: headerMedia.link, ...(headerMedia.filename ? { filename: headerMedia.filename } : {}) }
              : { id: headerMedia.mediaId },
        },
      ],
    });
  }
  if (bodyParams && bodyParams.length > 0) {
    components.push({ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) });
  }

  return postMessage(phoneNumberId, accessToken, {
    to: toE164.replace(/\D/g, ""),
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      // The header component must come before the body one; Meta reads
      // them in order and 400s on a header that arrives second.
      ...(components.length > 0 ? { components } : {}),
    },
  });
}

/**
 * Turns the authorisation code Embedded Signup returns into a token.
 *
 * The dialog hands the browser a short code; this swaps it, server-side
 * with the app secret, for a **business integration system user access
 * token**. That token does not expire with a browser session — it is the
 * only kind worth storing, and the reason the flow asks for a code rather
 * than letting the SDK hand back a client token.
 *
 * The code is single-use and short-lived. A second attempt with the same
 * one fails, which is why the action that calls this does everything else
 * afterwards.
 */
export async function exchangeSignupCode(
  appId: string,
  appSecret: string,
  code: string,
  /** `undefined` sends no redirect_uri at all; a string (even an empty one) sends exactly that. */
  redirectUri?: string,
): Promise<string> {
  const url = new URL(`${GRAPH_BASE_URL}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("code", code);
  if (redirectUri !== undefined) url.searchParams.set("redirect_uri", redirectUri);

  const response = await fetch(url.toString(), { method: "GET" });
  const body = await response.json();

  if (!response.ok || typeof body?.access_token !== "string") {
    throw new MetaGraphApiError(
      `Meta Graph API returned ${response.status} exchanging the Embedded Signup code`,
      response.status,
      body,
    );
  }

  return body.access_token as string;
}

/** Meta's "the redirect_uri does not match the one the code was issued for" (code 100, subcode 36008). */
export function isRedirectUriMismatch(error: unknown): boolean {
  if (!(error instanceof MetaGraphApiError)) return false;
  const detail = (error.body as { error?: { code?: number; error_subcode?: number } } | null)?.error;
  return detail?.error_subcode === 36008 || (detail?.code === 100 && /redirect_uri/i.test(error.message));
}

/** Meta's "Can't load URL: the domain of this URL isn't included in the app's domains" (code 191). */
export function isAppDomainError(error: unknown): boolean {
  if (!(error instanceof MetaGraphApiError)) return false;
  const detail = (error.body as { error?: { code?: number } } | null)?.error;
  return detail?.code === 191;
}

/**
 * Exchanges the Embedded Signup code, trying the redirect addresses Meta is
 * known to tie a JS-SDK code to.
 *
 * A code from the Facebook JavaScript SDK's popup belongs to a redirect
 * address the server cannot see, and Meta refuses the exchange with 36008 if
 * the one sent does not match (or 191 if that address's domain is not one of
 * the app's domains). Each form is tried in turn: none, an empty one, the
 * page that opened the popup, and Meta's own login-success page. A refusal
 * about the redirect moves on to the next form; any OTHER refusal (a bad
 * secret, an expired code) is the real answer and is returned at once.
 *
 * When every form fails, the error lists what Meta said to each, because
 * "which form was refused, and why" is exactly what is needed to fix it.
 * Returns which form worked, so it can be recorded.
 */
export async function exchangeSignupCodeWithFallbacks(
  appId: string,
  appSecret: string,
  code: string,
  pageAddresses: string[] = [],
): Promise<{ accessToken: string; redirectForm: string }> {
  const attempts: Array<{ label: string; value: string | undefined }> = [
    { label: "none", value: undefined },
    { label: "empty", value: "" },
    ...pageAddresses.map((address) => ({ label: address, value: address })),
    { label: "https://www.facebook.com/connect/login_success.html", value: "https://www.facebook.com/connect/login_success.html" },
  ];
  const outcomes: string[] = [];
  let lastRedirectError: MetaGraphApiError | null = null;
  for (const attempt of attempts) {
    try {
      return { accessToken: await exchangeSignupCode(appId, appSecret, code, attempt.value), redirectForm: attempt.label };
    } catch (error) {
      if (!isRedirectUriMismatch(error) && !isAppDomainError(error)) throw error;
      const refusal = error as MetaGraphApiError;
      lastRedirectError = refusal;
      const detail = (refusal.body as { error?: { code?: number; error_subcode?: number } } | null)?.error;
      outcomes.push(`${attempt.label || "(empty)"} → code ${detail?.code ?? "?"}${detail?.error_subcode ? `/${detail.error_subcode}` : ""}`);
    }
  }
  throw new RedirectExchangeError(outcomes, lastRedirectError as MetaGraphApiError);
}

/** Every redirect form was refused. Carries what Meta said to each, in order. */
export class RedirectExchangeError extends Error {
  constructor(
    readonly outcomes: string[],
    readonly last: MetaGraphApiError,
  ) {
    super(`Meta refused every redirect form: ${outcomes.join("; ")}`);
    this.name = "RedirectExchangeError";
  }
}

/**
 * Subscribes this app to a WhatsApp Business Account's webhooks.
 *
 * Without it the number connects and nothing is ever delivered — no
 * error, no clue, which is the single most common way a WhatsApp setup
 * ends up looking broken for a week. Embedded Signup does not do it for
 * you; it is a separate call, and this is why the onboarding action makes
 * it rather than leaving a step in a document.
 *
 * Which *fields* are delivered is configured on the app, not here: this
 * call only says "this app, that account".
 */
export async function subscribeAppToWaba(wabaId: string, accessToken: string): Promise<void> {
  const response = await fetch(`${GRAPH_BASE_URL}/${wabaId}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json();

  if (!response.ok || body?.success === false) {
    throw new MetaGraphApiError(
      `Meta Graph API returned ${response.status} subscribing the app to WhatsApp Business Account ${wabaId}`,
      response.status,
      body,
    );
  }
}

export interface PhoneNumberHealth {
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  /** GREEN, YELLOW, RED or UNKNOWN — Meta's own quality rating. */
  qualityRating: string | null;
  /** e.g. TIER_1K, TIER_10K: how many people we may start a conversation with per day. */
  messagingLimitTier: string | null;
  status: string | null;
}

/** Meta's view of the sending number: quality rating, daily limit tier, status. Throws MetaGraphApiError on refusal. */
export async function fetchPhoneNumberHealth(phoneNumberId: string, accessToken: string): Promise<PhoneNumberHealth> {
  const fields = "display_phone_number,verified_name,quality_rating,messaging_limit_tier,status";
  const response = await fetch(`${GRAPH_BASE_URL}/${phoneNumberId}?fields=${fields}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const body = (await response.json()) as Record<string, string | undefined>;
  if (!response.ok) throw new MetaGraphApiError(`WhatsApp Cloud API returned ${response.status} reading the number`, response.status, body);
  return {
    displayPhoneNumber: body.display_phone_number ?? null,
    verifiedName: body.verified_name ?? null,
    qualityRating: body.quality_rating ?? null,
    messagingLimitTier: body.messaging_limit_tier ?? null,
    status: body.status ?? null,
  };
}

export interface AppWebhookSubscription {
  callbackUrl: string | null;
  active: boolean;
  /** The webhook fields the app is subscribed to, e.g. "messages", "smb_message_echoes". */
  fields: string[];
}

/**
 * What the Meta *app* is subscribed to for WhatsApp: the callback address and
 * which webhook fields it delivers. Read with the app access token
 * (`app_id|app_secret`), so it needs no user login on the developer dashboard.
 * Null when the app has no WhatsApp webhook configured at all.
 */
export async function fetchAppWebhookSubscription(appId: string, appSecret: string): Promise<AppWebhookSubscription | null> {
  const url = new URL(`${GRAPH_BASE_URL}/${appId}/subscriptions`);
  url.searchParams.set("access_token", `${appId}|${appSecret}`);
  const response = await fetch(url.toString(), { cache: "no-store" });
  const body = (await response.json()) as {
    data?: Array<{ object?: string; callback_url?: string; active?: boolean; fields?: Array<{ name?: string }> }>;
  };
  if (!response.ok) throw new MetaGraphApiError(`Meta returned ${response.status} reading the app's webhook settings`, response.status, body);
  const sub = (body.data ?? []).find((s) => s.object === "whatsapp_business_account");
  if (!sub) return null;
  return {
    callbackUrl: sub.callback_url ?? null,
    active: sub.active !== false,
    fields: (sub.fields ?? []).flatMap((f) => (f.name ? [f.name] : [])),
  };
}

/**
 * Sets the WhatsApp webhook fields the app delivers. Meta verifies the callback
 * again with the verify token while doing this, so the CRM's own webhook
 * route has to be reachable. Fields are replaced by the list given, so the
 * caller passes the existing ones plus what is missing.
 */
export async function setAppWebhookFields(
  appId: string,
  appSecret: string,
  input: { callbackUrl: string; verifyToken: string; fields: string[] },
): Promise<void> {
  const form = new URLSearchParams({
    object: "whatsapp_business_account",
    callback_url: input.callbackUrl,
    verify_token: input.verifyToken,
    fields: input.fields.join(","),
    access_token: `${appId}|${appSecret}`,
  });
  const response = await fetch(`${GRAPH_BASE_URL}/${appId}/subscriptions`, { method: "POST", body: form });
  const body = (await response.json()) as { success?: boolean };
  if (!response.ok || body.success === false) {
    throw new MetaGraphApiError(`Meta returned ${response.status} updating the webhook fields`, response.status, body);
  }
}

/** Which apps are subscribed to this WhatsApp Business Account. */
export async function fetchWabaSubscribedApps(wabaId: string, accessToken: string): Promise<string[]> {
  const response = await fetch(`${GRAPH_BASE_URL}/${wabaId}/subscribed_apps`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const body = (await response.json()) as { data?: Array<{ whatsapp_business_api_data?: { id?: string }; id?: string }> };
  if (!response.ok) throw new MetaGraphApiError(`Meta returned ${response.status} reading the account's subscribed apps`, response.status, body);
  return (body.data ?? []).flatMap((a) => {
    const id = a.whatsapp_business_api_data?.id ?? a.id;
    return id ? [id] : [];
  });
}

export type GraphFact = { ok: true; value: unknown } | { ok: false; error: string };

/**
 * Asks Meta for each field on a node separately.
 *
 * One request for all of them fails entirely if Meta does not know a single
 * field ("(#100) Tried accessing nonexisting field"), and which fields exist
 * differs by account and by Meta's rollout. One request per field means an
 * unsupported field is reported as unsupported and everything else still
 * comes back.
 */
export async function fetchGraphFacts(nodeId: string, accessToken: string, fields: string[]): Promise<Record<string, GraphFact>> {
  const out: Record<string, GraphFact> = {};
  await Promise.all(
    fields.map(async (field) => {
      try {
        const response = await fetch(`${GRAPH_BASE_URL}/${nodeId}?fields=${encodeURIComponent(field)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        });
        const body = (await response.json()) as Record<string, unknown> & { error?: { message?: string } };
        out[field] = response.ok ? { ok: true, value: body[field] ?? null } : { ok: false, error: body.error?.message ?? `HTTP ${response.status}` };
      } catch {
        out[field] = { ok: false, error: "could not reach Meta" };
      }
    }),
  );
  return out;
}

/** The raw subscribed-apps entries of an account, including any callback address that overrides the app's own. */
export async function fetchWabaSubscriptionDetail(
  wabaId: string,
  accessToken: string,
): Promise<Array<{ appId: string | null; overrideCallbackUri: string | null }>> {
  const response = await fetch(`${GRAPH_BASE_URL}/${wabaId}/subscribed_apps`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const body = (await response.json()) as {
    data?: Array<{ whatsapp_business_api_data?: { id?: string }; id?: string; override_callback_uri?: string }>;
  };
  if (!response.ok) throw new MetaGraphApiError(`Meta returned ${response.status} reading the account's subscribed apps`, response.status, body);
  return (body.data ?? []).map((a) => ({
    appId: a.whatsapp_business_api_data?.id ?? a.id ?? null,
    overrideCallbackUri: a.override_callback_uri ?? null,
  }));
}

/** The phone numbers on a WhatsApp Business Account. Used to find the number a Coexistence signup just attached. */
export async function listWabaPhoneNumbers(
  wabaId: string,
  accessToken: string,
): Promise<Array<{ id: string; displayPhoneNumber: string | null; verifiedName: string | null }>> {
  const url = new URL(`${GRAPH_BASE_URL}/${wabaId}/phone_numbers`);
  url.searchParams.set("fields", "id,display_phone_number,verified_name");
  url.searchParams.set("limit", "50");
  const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  const body = (await response.json()) as { data?: Array<{ id?: string; display_phone_number?: string; verified_name?: string }> };
  if (!response.ok) throw new MetaGraphApiError(`Meta returned ${response.status} listing the account's phone numbers`, response.status, body);
  return (body.data ?? []).flatMap((n) =>
    n.id ? [{ id: n.id, displayPhoneNumber: n.display_phone_number ?? null, verifiedName: n.verified_name ?? null }] : [],
  );
}

/**
 * The WhatsApp Business Accounts an access token was granted, read from
 * Meta's own record of the token (`debug_token` → granular scopes). Lets the
 * CRM work out which account a signup connected from the authorisation code
 * alone, when Meta's finish message never arrives.
 */
export async function wabaIdsForToken(appId: string, appSecret: string, accessToken: string): Promise<string[]> {
  const url = new URL(`${GRAPH_BASE_URL}/debug_token`);
  url.searchParams.set("input_token", accessToken);
  url.searchParams.set("access_token", `${appId}|${appSecret}`);
  const response = await fetch(url.toString(), { cache: "no-store" });
  const body = (await response.json()) as {
    data?: { granular_scopes?: Array<{ scope?: string; target_ids?: string[] }> };
  };
  if (!response.ok) throw new MetaGraphApiError(`Meta returned ${response.status} reading the token`, response.status, body);
  const ids = (body.data?.granular_scopes ?? [])
    .filter((g) => g.scope === "whatsapp_business_management" || g.scope === "whatsapp_business_messaging")
    .flatMap((g) => g.target_ids ?? []);
  return [...new Set(ids)];
}
