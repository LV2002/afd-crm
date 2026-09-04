import { MetaGraphApiError } from "../meta/graph-client";

/**
 * Message templates on the WhatsApp Business Account.
 *
 * Templates are the only thing Meta lets you send outside the 24-hour
 * customer service window, and every one has to be approved by Meta
 * before it can be sent. That approval is why this exists: the CRM used
 * to make a counsellor type a template name from memory and find out it
 * was wrong when the send failed.
 *
 * Templates live on the WhatsApp Business Account (`waba_id`), not on the
 * phone number — the same template is sendable from any number under the
 * account, which is why sending needs `phone_number_id` and this file
 * needs `waba_id`.
 *
 * Nothing here is stored in our database. Meta owns the approval state,
 * it changes without telling us (a template can be approved overnight, or
 * paused later for poor feedback), and a local copy would be wrong more
 * often than right.
 */

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export const TEMPLATE_CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const TEMPLATE_STATUSES = [
  "APPROVED",
  "PENDING",
  "REJECTED",
  "PAUSED",
  "DISABLED",
  "IN_APPEAL",
  "PENDING_DELETION",
] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export interface TemplateButton {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phone_number?: string;
}

export interface TemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  text?: string;
  buttons?: TemplateButton[];
}

export interface MessageTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: TemplateComponent[];
  /** Meta's reason when status is REJECTED — the only thing that makes a rejection actionable. */
  rejected_reason?: string;
}

interface ListResponse {
  data?: MessageTemplate[];
}

export async function listMessageTemplates(
  wabaId: string,
  accessToken: string,
): Promise<MessageTemplate[]> {
  const url = new URL(`${GRAPH_BASE_URL}/${wabaId}/message_templates`);
  url.searchParams.set("fields", "id,name,language,category,status,components,rejected_reason");
  url.searchParams.set("limit", "200");

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    // Approval state changes on Meta's side, so a cached list is a list
    // that tells somebody a template is still pending after it went live.
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok) {
    throw new MetaGraphApiError(
      `WhatsApp returned ${response.status} listing templates`,
      response.status,
      body,
    );
  }
  return (body as ListResponse).data ?? [];
}

export interface CreateTemplateInput {
  /** Meta's rule: lowercase letters, digits and underscores only. */
  name: string;
  language: string;
  category: TemplateCategory;
  /** `{{1}}`, `{{2}}` … placeholders are filled in order at send time. */
  body: string;
  header?: string;
  footer?: string;
  /** Quick replies show as tappable buttons and come back as an inbound message with that exact text. */
  quickReplies?: string[];
}

export interface CreateTemplateResult {
  id: string;
  status: string;
  category: string;
}

export function buildTemplateComponents(input: CreateTemplateInput): TemplateComponent[] {
  const components: TemplateComponent[] = [];
  if (input.header?.trim()) {
    components.push({ type: "HEADER", format: "TEXT", text: input.header.trim() });
  }
  components.push({ type: "BODY", text: input.body.trim() });
  if (input.footer?.trim()) {
    components.push({ type: "FOOTER", text: input.footer.trim() });
  }
  const replies = (input.quickReplies ?? []).map((text) => text.trim()).filter(Boolean);
  if (replies.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: replies.map((text) => ({ type: "QUICK_REPLY", text })),
    });
  }
  return components;
}

export async function createMessageTemplate(
  wabaId: string,
  accessToken: string,
  input: CreateTemplateInput,
): Promise<CreateTemplateResult> {
  const response = await fetch(`${GRAPH_BASE_URL}/${wabaId}/message_templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      name: input.name,
      language: input.language,
      category: input.category,
      components: buildTemplateComponents(input),
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new MetaGraphApiError(
      `WhatsApp returned ${response.status} creating the template`,
      response.status,
      body,
    );
  }
  return body as CreateTemplateResult;
}

/** Deletes every language version of a template — that is what Meta's endpoint does, and pretending otherwise would surprise somebody. */
export async function deleteMessageTemplate(
  wabaId: string,
  accessToken: string,
  name: string,
): Promise<void> {
  const url = new URL(`${GRAPH_BASE_URL}/${wabaId}/message_templates`);
  url.searchParams.set("name", name);

  const response = await fetch(url.toString(), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new MetaGraphApiError(
      `WhatsApp returned ${response.status} deleting the template`,
      response.status,
      body,
    );
  }
}

/** The body text of a template, for previewing it in a list. */
export function templateBody(template: MessageTemplate): string {
  return template.components.find((component) => component.type === "BODY")?.text ?? "";
}

/** The quick-reply button labels, if it has any. */
/**
 * "image", "video", "document" — or null when the header is text or there
 * is no header at all.
 *
 * A template's header format is fixed at approval time: Meta rejects a
 * media header component on a TEXT-header template and rejects a send that
 * omits one on a media-header template. So this is what decides whether a
 * broadcast even offers a file field, rather than letting somebody attach
 * a video to a template that cannot carry one.
 */
export function templateHeaderMediaKind(
  template: MessageTemplate,
): "image" | "video" | "document" | null {
  const header = template.components.find((component) => component.type === "HEADER");
  switch (header?.format) {
    case "IMAGE":
      return "image";
    case "VIDEO":
      return "video";
    case "DOCUMENT":
      return "document";
    default:
      return null;
  }
}

export function templateQuickReplies(template: MessageTemplate): string[] {
  const buttons = template.components.find((component) => component.type === "BUTTONS")?.buttons;
  return (buttons ?? []).filter((b) => b.type === "QUICK_REPLY").map((b) => b.text);
}

/** How many `{{n}}` placeholders the body has, so the send form can ask for exactly that many values. */
export function templatePlaceholderCount(template: MessageTemplate): number {
  const matches = templateBody(template).match(/\{\{\s*(\d+)\s*\}\}/g) ?? [];
  const numbers = matches.map((m) => Number(m.replace(/\D/g, "")));
  return numbers.length === 0 ? 0 : Math.max(...numbers);
}

/**
 * Meta's naming rule, checked before the request rather than after: a
 * rejected name comes back as an opaque 400, and "lowercase, digits and
 * underscores" is easier to read than that.
 */
export function isValidTemplateName(name: string): boolean {
  return /^[a-z0-9_]{1,512}$/.test(name);
}
