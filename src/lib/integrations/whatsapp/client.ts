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
): Promise<string> {
  return postMessage(phoneNumberId, accessToken, {
    to: toE164.replace(/\D/g, ""),
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(bodyParams && bodyParams.length > 0
        ? { components: [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }] }
        : {}),
    },
  });
}
