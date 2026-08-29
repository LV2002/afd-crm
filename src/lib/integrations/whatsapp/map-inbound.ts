import type { ResolveLeadInput } from "@/lib/identity/resolve-or-create-lead";

export interface WhatsAppInboundMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string };
  document?: { id: string; mime_type: string; filename?: string };
  audio?: { id: string; mime_type: string };
  video?: { id: string; mime_type: string };
  sticker?: { id: string; mime_type: string };
}

export interface WhatsAppContact {
  profile?: { name?: string };
  wa_id: string;
}

/**
 * WhatsApp's contact "profile name" is whatever the user set as their own
 * display name — not a claim of their real name, and not always present.
 * Used only as a friendlier starting point than a bare phone number; a
 * counsellor is expected to correct it once they know who they're talking
 * to, the same way any placeholder studentName elsewhere in this system
 * gets corrected by a human, not guessed harder by the ingestion path.
 */
export function resolveContactName(contact: WhatsAppContact | undefined, fromPhone: string): string {
  const profileName = contact?.profile?.name?.trim();
  return profileName || `WhatsApp Lead ${fromPhone.slice(-4)}`;
}

/**
 * Composes an inbound message into exactly what `resolveOrCreateLead()`
 * needs. `assignedTo` is set by the caller to the counsellor who owns the
 * number the message arrived on (per the "one number per counsellor"
 * model) — a customer messaging a specific counsellor's number is a
 * stronger routing signal than any assignment rule, so it's passed through
 * as an explicit assignment rather than left to `applyAssignment()`. See
 * docs/DECISIONS.md.
 */
export function buildResolveLeadInput(message: WhatsAppInboundMessage, contactName: string, assignedTo: string | null): ResolveLeadInput {
  return {
    studentName: contactName,
    primaryPhone: message.from,
    source: "whatsapp",
    raw: message as unknown as Record<string, unknown>,
    dedupeKey: message.id,
    assignedTo: assignedTo ?? undefined,
    receivedAt: new Date(Number(message.timestamp) * 1000),
  };
}

export interface MappedMessageContent {
  messageType: "text" | "template" | "media";
  body: string | null;
  mediaId: string | null;
  mediaMimeType: string | null;
}

/**
 * Media (image/document/audio/video/sticker) is recorded by its Meta media
 * id and mime type only — not downloaded into Supabase Storage in this
 * pass, a deliberate, documented gap (see docs/DECISIONS.md), not a
 * dropped message: the raw webhook delivery is still in `webhook_events`.
 */
export function mapMessageContent(message: WhatsAppInboundMessage): MappedMessageContent {
  if (message.type === "text") {
    return { messageType: "text", body: message.text?.body ?? null, mediaId: null, mediaMimeType: null };
  }
  const media = message.image ?? message.document ?? message.audio ?? message.video ?? message.sticker;
  if (media) {
    return { messageType: "media", body: null, mediaId: media.id, mediaMimeType: media.mime_type };
  }
  return { messageType: "text", body: null, mediaId: null, mediaMimeType: null };
}
