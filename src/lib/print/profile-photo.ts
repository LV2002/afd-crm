import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSignedUrl, listAttachments } from "@/lib/storage/attachments";
import type { AttachmentRow } from "@/lib/storage/shared";

/**
 * The photograph that goes in the box on a printed profile sheet.
 *
 * ## Why this needed its own module
 *
 * `photo_url` was a `url` field — somebody pasted a link — so both print
 * pages looked for a string starting with `http`. It is a file upload now
 * (migration 0075), and the stored answer is the FILENAME, so that test
 * fails for every real photo and the sheet prints an empty dashed box.
 * Which is what it did for Leon's first submitted form.
 *
 * ## Where the file actually is
 *
 * On the LEAD, not the student. A student uploads the photo on the
 * tokenised profile form, weeks before a `students` row exists — so the
 * student's own print sheet has to look at the lead it came from as well
 * as at its own attachments, or the photo vanishes at Gate 2.
 *
 * ## How it is identified
 *
 * By `field_key`, exactly: this file is the answer to that question. The
 * old heuristic — an image whose label contains the word "photo" — is kept
 * as a fallback, because a counsellor who uploaded a passport photo by hand
 * before the question existed labelled it something sensible and that is
 * still the photo. Exact first, guess second.
 */

/** The question whose answer is the student's photograph. */
export const PHOTO_FIELD_KEY = "photo_url";

/**
 * Picks the photo out of a lead's or student's files. Pure, so the
 * precedence is testable without Storage.
 */
export function pickPhotoAttachment(rows: readonly AttachmentRow[]): AttachmentRow | null {
  // A PDF is a perfectly valid thing to attach to a photo question and a
  // useless thing to put in an <img>. Never a candidate. (Soft-deleted
  // files never reach here — `listAttachments` filters them out.)
  const images = rows.filter((row) => row.mime_type.startsWith("image/"));

  const byField = images
    .filter((row) => row.field_key === PHOTO_FIELD_KEY)
    // Newest wins: a student who sent a second photo meant to replace the
    // first, and nobody prints the one they rejected.
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (byField[0]) return byField[0];

  const byLabel = images
    .filter((row) => (row.label ?? "").toLowerCase().includes("photo"))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return byLabel[0] ?? null;
}

/**
 * A signed URL for the photograph, or null.
 *
 * Both ids are optional and both are searched, because the file may be on
 * either side of Gate 2. Reads through the caller's RLS-bound client, so a
 * sheet never prints a photo its reader could not otherwise open.
 */
export async function resolveProfilePhotoUrl(
  supabase: SupabaseClient,
  parents: { leadId?: string | null; studentId?: string | null },
  /** The raw `photo_url` answer, still honoured when it is a pasted link. */
  pastedValue?: unknown,
): Promise<string | null> {
  const rows: AttachmentRow[] = [];
  if (parents.studentId) {
    rows.push(...(await listAttachments(supabase, { kind: "student", id: parents.studentId })));
  }
  if (parents.leadId) {
    rows.push(...(await listAttachments(supabase, { kind: "lead", id: parents.leadId })));
  }

  const photo = pickPhotoAttachment(rows);
  if (photo) {
    const signed = await createSignedUrl(supabase, photo.storage_path);
    if (signed) return signed;
  }

  // Profiles filled in before Storage existed still print with a picture.
  return typeof pastedValue === "string" && /^https?:\/\//i.test(pastedValue.trim())
    ? pastedValue.trim()
    : null;
}
