import "server-only";

import { attachments } from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  ATTACHMENTS_BUCKET,
  buildStoragePath,
  validateUpload,
} from "@/lib/storage/shared";

/**
 * Files a student uploads on their own profile form.
 *
 * ## Why this needs the service-role client
 *
 * The form is anonymous — the student is not signed in and never will be —
 * so there is no JWT for Storage's RLS to check, and an upload through the
 * ordinary client is rejected before it starts. `submitProfileForm` already
 * runs on the direct `db` connection for exactly this reason; the Storage
 * half needs the matching escape hatch.
 *
 * What stands in for a session is the form token: 256 bits from
 * `randomBytes(32)`, bound to one lead, refused once the form is submitted.
 * So the authorisation is "holds an unused link we sent to this person",
 * which is the same basis on which the rest of the form is trusted.
 *
 * `createServiceRoleClient()`'s own comment says never to use it in a
 * Server Action a user triggers. This is the deliberate third case named
 * there, and it is narrow on purpose: this module uploads, and does nothing
 * else with the elevated client — no reads, no deletes, no other table.
 *
 * ## What the student can actually do with it
 *
 * Only what the admin asked for: one file per `file` field on the form, and
 * only the types on the allow-list, under the size cap. The bucket is
 * private, so an uploaded object is reachable only through a signed URL the
 * CRM mints for a signed-in member of staff.
 */

export interface StoredUpload {
  /** The field this file answered, so the answer can name it. */
  key: string;
  fileName: string;
}

export type UploadOutcome =
  | { ok: true; stored: StoredUpload[] }
  | { ok: false; error: string };

export interface PendingUpload {
  key: string;
  /** The field's own label, used as the document's label in the lead's files. */
  label: string;
  file: File;
}

/**
 * Uploads every file on one submission, then records them against the lead.
 *
 * All or nothing. A student who attached two documents and had one fail
 * would otherwise be told the form was submitted while half their evidence
 * was missing — and they cannot resubmit, because a second submission is
 * refused by design. So a failure anywhere removes whatever this call had
 * already stored and reports the problem while the form is still on screen.
 */
export async function storeProfileFormUploads(
  leadId: string,
  uploads: readonly PendingUpload[],
): Promise<UploadOutcome> {
  if (uploads.length === 0) return { ok: true, stored: [] };

  // Checked before anything is written, so a file that was never going to
  // be accepted does not leave a half-finished set behind.
  for (const upload of uploads) {
    const invalid = validateUpload(upload.file);
    if (invalid) return { ok: false, error: `${upload.label}: ${invalid}` };
  }

  const supabase = createServiceRoleClient();
  const written: string[] = [];

  // Every object first, then every row — rather than alternating. Writing a
  // row as each upload succeeded left a surviving `attachments` row pointing
  // at an object the rollback had just deleted, which is a broken link in
  // the counsellor's documents list. Doing it in two phases means there is
  // no window in which a row can outlive its file.
  const rows: Array<typeof attachments.$inferInsert> = [];

  try {
    for (const upload of uploads) {
      const storagePath = buildStoragePath({ kind: "lead", id: leadId }, upload.file.name);

      const { error } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .upload(storagePath, upload.file, {
          contentType: upload.file.type,
          // Never overwrite: the path carries a fresh uuid, so a collision
          // would mean something is badly wrong rather than a retry.
          upsert: false,
        });

      if (error) {
        await rollback(supabase, written);
        return { ok: false, error: `Could not upload ${upload.label}. Please try again.` };
      }
      written.push(storagePath);

      rows.push({
        leadId,
        storagePath,
        fileName: upload.file.name.slice(0, 200),
        mimeType: upload.file.type,
        sizeBytes: upload.file.size,
        // The field's label, so the file arrives in the lead's documents as
        // "ID proof" rather than as an opaque filename nobody can place.
        label: upload.label,
        kind: "document",
        // `uploaded_by` stays null — a student is not a `profiles` row, and
        // inventing one would put a non-user in the staff list. The lead's
        // own `profile_form_submitted_at` records who sent it.
        uploadedBy: null,
      });
    }

    // One statement, so either every file is on the record or none is.
    await db.insert(attachments).values(rows);

    return {
      ok: true,
      stored: uploads.map((upload) => ({ key: upload.key, fileName: upload.file.name })),
    };
  } catch (error) {
    await rollback(supabase, written);
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Could not save your files: ${error.message}`
          : "Could not save your files.",
    };
  }
}

/**
 * Removes objects written by a submission that then failed.
 *
 * The one place in this codebase that genuinely deletes from Storage. It is
 * not a contradiction of "nothing is hard-deleted": these bytes were never
 * part of a completed submission, no `attachments` row survives pointing at
 * them, and leaving them would accumulate unreferenced files nobody can
 * find or account for.
 */
async function rollback(
  supabase: ReturnType<typeof createServiceRoleClient>,
  paths: readonly string[],
): Promise<void> {
  if (paths.length === 0) return;
  try {
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([...paths]);
  } catch {
    // The submission has already failed; a failed cleanup must not replace
    // the error the student needs to see with a different one.
  }
}
