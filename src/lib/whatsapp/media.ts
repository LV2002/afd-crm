/**
 * What WhatsApp will accept as an attachment, and what it calls it.
 *
 * Pure — no network, no database — so the composer can refuse a 40 MB
 * video before uploading it and the Server Action can refuse the same file
 * again on the server. The two must agree, which is the only reason this
 * is a module rather than two lists.
 *
 * The limits and the type list are Meta's, not ours: the Cloud API rejects
 * anything outside them at send time with an error a counsellor cannot act
 * on, so the honest place to say "that video is too big" is here. They are
 * deliberately NOT in `dropdown_options` — an admin raising the video limit
 * to 100 MB would not change what Meta accepts, it would only move the
 * rejection somewhere less useful (CLAUDE.md § What is configurable).
 *
 * Note the limits are lower than the CRM's own 20 MB attachment cap for
 * images (5 MB) and higher for video (16 MB), so neither list subsumes the
 * other and `validateWhatsAppMedia` is not a duplicate of `validateUpload`.
 */

/** Meta's own word for the message type; it goes straight into the send payload. */
export type WhatsAppMediaKind = "image" | "video" | "document";

interface MediaRule {
  kind: WhatsAppMediaKind;
  maxBytes: number;
}

const MB = 1024 * 1024;

/**
 * Meta accepts more types than this (audio, stickers, several document
 * formats). This is the subset AFD actually sends: a photo or a video of
 * the campus and the occasional PDF brochure. Adding one is a line here,
 * and nothing else.
 */
const MEDIA_RULES: Record<string, MediaRule> = {
  "image/jpeg": { kind: "image", maxBytes: 5 * MB },
  "image/png": { kind: "image", maxBytes: 5 * MB },
  "video/mp4": { kind: "video", maxBytes: 16 * MB },
  "video/3gpp": { kind: "video", maxBytes: 16 * MB },
  "application/pdf": { kind: "document", maxBytes: 100 * MB },
};

export const WHATSAPP_MEDIA_EXTENSIONS = ".jpg,.jpeg,.png,.mp4,.3gp,.pdf";

/** The mime type Meta will accept, or null if it will not. */
export function mediaKindFor(mimeType: string): WhatsAppMediaKind | null {
  return MEDIA_RULES[mimeType]?.kind ?? null;
}

function describeLimit(bytes: number): string {
  return `${Math.round(bytes / MB)} MB`;
}

/**
 * Returns an error message a counsellor can act on, or null if the file is
 * sendable. Mirrors `validateUpload`'s shape so both are used the same way.
 */
export function validateWhatsAppMedia(file: { size: number; type: string }): string | null {
  if (file.size === 0) return "That file is empty.";

  const rule = MEDIA_RULES[file.type];
  if (!rule) {
    return "WhatsApp accepts JPG and PNG images, MP4 or 3GP video, and PDF documents.";
  }
  if (file.size > rule.maxBytes) {
    return `That ${rule.kind} is ${(file.size / MB).toFixed(1)} MB. WhatsApp's limit for ${rule.kind}s is ${describeLimit(rule.maxBytes)}.`;
  }
  return null;
}

/**
 * WhatsApp captions ride along with image, video and document messages and
 * are truncated by the client past this length, so it is trimmed here
 * rather than sent and silently cut.
 */
export const MAX_CAPTION_LENGTH = 1024;

export function trimCaption(caption: string): string {
  return caption.trim().slice(0, MAX_CAPTION_LENGTH);
}
