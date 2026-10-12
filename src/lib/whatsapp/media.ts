import { MAX_UPLOAD_BYTES } from "@/lib/storage/shared";

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
 * Every limit here is also capped at the CRM's own upload size (4 MB), which
 * is what actually fits through a Server Action on this hosting.
 */

/** Meta's own word for the message type; it goes straight into the send payload. */
export type WhatsAppMediaKind = "image" | "video" | "audio" | "document";

interface MediaRule {
  kind: WhatsAppMediaKind;
  maxBytes: number;
}

const MB = 1024 * 1024;

/**
 * What fits through the CRM, whatever Meta would accept: the Server Action body
 * limit (see MAX_UPLOAD_BYTES). A 16 MB video is fine for WhatsApp and
 * impossible from here, so the rule is the smaller of the two.
 */
const CAP = MAX_UPLOAD_BYTES;

/**
 * Meta accepts more types than this (audio, stickers, several document
 * formats). This is the subset AFD actually sends: a photo or a video of
 * the campus and the occasional PDF brochure. Adding one is a line here,
 * and nothing else.
 */
const MEDIA_RULES: Record<string, MediaRule> = {
  "image/jpeg": { kind: "image", maxBytes: Math.min(5 * MB, CAP) },
  "image/png": { kind: "image", maxBytes: Math.min(5 * MB, CAP) },
  "video/mp4": { kind: "video", maxBytes: Math.min(16 * MB, CAP) },
  "video/3gpp": { kind: "video", maxBytes: Math.min(16 * MB, CAP) },
  // Voice notes and recordings. Audio takes no caption.
  "audio/aac": { kind: "audio", maxBytes: Math.min(16 * MB, CAP) },
  "audio/mp4": { kind: "audio", maxBytes: Math.min(16 * MB, CAP) },
  "audio/mpeg": { kind: "audio", maxBytes: Math.min(16 * MB, CAP) },
  "audio/amr": { kind: "audio", maxBytes: Math.min(16 * MB, CAP) },
  "audio/ogg": { kind: "audio", maxBytes: Math.min(16 * MB, CAP) },
  // Documents: brochures, fee sheets, syllabi.
  "application/pdf": { kind: "document", maxBytes: Math.min(100 * MB, CAP) },
  "application/msword": { kind: "document", maxBytes: Math.min(100 * MB, CAP) },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { kind: "document", maxBytes: Math.min(100 * MB, CAP) },
  "application/vnd.ms-excel": { kind: "document", maxBytes: Math.min(100 * MB, CAP) },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { kind: "document", maxBytes: Math.min(100 * MB, CAP) },
  "application/vnd.ms-powerpoint": { kind: "document", maxBytes: Math.min(100 * MB, CAP) },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { kind: "document", maxBytes: Math.min(100 * MB, CAP) },
  "text/plain": { kind: "document", maxBytes: Math.min(100 * MB, CAP) },
};

export const WHATSAPP_MEDIA_EXTENSIONS =
  ".jpg,.jpeg,.png,.mp4,.3gp,.aac,.m4a,.mp3,.amr,.ogg,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt";

/**
 * A template's header can be an image, a video or a PDF — not audio, and not
 * the Office formats a free-form message can carry. The broadcast form offers
 * only these, and the server refuses anything else.
 */
export const BROADCAST_HEADER_EXTENSIONS = ".jpg,.jpeg,.png,.mp4,.3gp,.pdf";

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
    return "WhatsApp accepts JPG and PNG images, MP4 or 3GP video, audio (MP3, M4A, AAC, AMR, OGG), and PDF, Word, Excel, PowerPoint or text documents.";
  }
  if (file.size > rule.maxBytes) {
    return `That ${rule.kind} is ${(file.size / MB).toFixed(1)} MB. Files sent from the CRM can be up to ${describeLimit(rule.maxBytes)} — send bigger ones from the WhatsApp Business app on your phone.`;
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
