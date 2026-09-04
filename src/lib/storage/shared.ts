/**
 * Constants, types and pure helpers for file attachments — no database or
 * Storage access, so this is importable from client components too.
 *
 * Split from `attachments.ts` for exactly that reason: that module is
 * `server-only` (it takes a Supabase client), and the upload UI is a client
 * component that still needs the size limit and accepted extensions to
 * render honest constraints. Keeping the numbers here means the form and
 * the server-side check cannot drift apart.
 */

export const ATTACHMENTS_BUCKET = "attachments";

/** 20 MB. A scanned agreement or a phone photo fits; a video does not. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/**
 * Allow-list rather than a block-list. The bucket is private and files are
 * only ever served through short-lived signed URLs, but a permissive list
 * still invites someone to use the CRM as a general file host, and an
 * uploaded .html or .svg served from a Supabase domain is a stored-XSS
 * vector if that URL is ever opened directly.
 */
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;

export const ALLOWED_EXTENSIONS = ".jpg,.jpeg,.png,.webp,.heic,.pdf";

export type AttachmentParent = { kind: "lead"; id: string } | { kind: "student"; id: string };

/**
 * What a file is to the system. Two values, both enforcement points:
 * `signed_agreement` is the one document a counsellor is asked for and the
 * one accounts looks for before chasing an instalment; everything else is
 * a `document`. Deliberately NOT admin-configurable — the code branches on
 * these, so a new value would be a value nothing knows how to act on
 * (CLAUDE.md § What is configurable, "fixed in code" list). The
 * human-facing description of a file is `label`, which is free text.
 */
export const ATTACHMENT_KINDS = ["signed_agreement", "document"] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export function isAttachmentKind(value: unknown): value is AttachmentKind {
  return typeof value === "string" && (ATTACHMENT_KINDS as readonly string[]).includes(value);
}

/** Written on upload so the list reads sensibly without a special case. */
export const SIGNED_AGREEMENT_LABEL = "Signed instalment agreement";

export interface AttachmentRow {
  id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  label: string | null;
  kind: string;
  created_at: string;
  uploaded_by: string | null;
}

/** The current signed agreement is the most recent one; the rest are superseded. */
export function currentSignedAgreement(rows: AttachmentRow[]): AttachmentRow | null {
  const agreements = rows
    .filter((row) => row.kind === "signed_agreement")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return agreements[0] ?? null;
}

/** Everything that is not the signed agreement, newest first. */
export function otherDocuments(rows: AttachmentRow[]): AttachmentRow[] {
  return rows.filter((row) => row.kind !== "signed_agreement");
}

/**
 * Strips everything that could change how a path is interpreted rather than
 * trying to guess a "safe" name: path separators and traversal sequences
 * above all, since the object key is what the Storage policies parse to
 * decide access. A name that sanitises to nothing still gets a usable key
 * because the uuid prefix added by `buildStoragePath` is always present.
 */
export function sanitiseFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  return (
    base
      .replace(/[^\w.\- ]+/g, "_")
      .replace(/\.{2,}/g, ".")
      .replace(/^[.\s]+/, "")
      .trim()
      .slice(0, 120) || "file"
  );
}

/**
 * `<kind>/<parent id>/<uuid>-<name>`. The first two segments are not
 * cosmetic: migration 0031's Storage policies read them with
 * `storage.foldername()` to find the owning lead or student and authorise
 * the object. Changing this shape without changing those policies would
 * break access control, so the two must move together.
 */
export function buildStoragePath(parent: AttachmentParent, fileName: string): string {
  return `${parent.kind}/${parent.id}/${crypto.randomUUID()}-${sanitiseFileName(fileName)}`;
}

export function validateUpload(file: { size: number; type: string; name: string }): string | null {
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_FILE_BYTES) {
    return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_FILE_BYTES / 1024 / 1024} MB.`;
  }
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "Only images (JPG, PNG, WebP, HEIC) and PDFs can be uploaded.";
  }
  return null;
}
