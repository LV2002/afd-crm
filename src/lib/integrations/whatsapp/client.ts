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
  /** Meta's own message type — "image", "video" or "document". */
  kind: "image" | "video" | "document";
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
  if (media.caption) payload.caption = media.caption;
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
  headerMedia?: { kind: "image" | "video" | "document"; mediaId: string },
): Promise<string> {
  const components: Array<Record<string, unknown>> = [];
  if (headerMedia) {
    components.push({
      type: "header",
      parameters: [{ type: headerMedia.kind, [headerMedia.kind]: { id: headerMedia.mediaId } }],
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
