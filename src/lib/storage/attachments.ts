import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ATTACHMENTS_BUCKET,
  currentSignedAgreement,
  type AttachmentParent,
  type AttachmentRow,
} from "./shared";

/**
 * Database and Storage access for attachments.
 *
 * Everything here runs through the caller's own RLS-bound Supabase client —
 * never the service-role key (CLAUDE.md § Non-negotiables 3). That is not
 * incidental: the Storage policies in migration 0031 are the only thing
 * standing between a counsellor and another centre's documents, and they
 * only apply when the request carries the user's JWT. A helper that took
 * the service-role client would silently bypass every one of them.
 */

function parentColumn(parent: AttachmentParent): "lead_id" | "student_id" {
  return parent.kind === "lead" ? "lead_id" : "student_id";
}

export async function listAttachments(
  supabase: SupabaseClient,
  parent: AttachmentParent,
): Promise<AttachmentRow[]> {
  const { data, error } = await supabase
    .from("attachments")
    .select("id, storage_path, file_name, mime_type, size_bytes, label, kind, created_at, uploaded_by")
    .eq(parentColumn(parent), parent.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  // RLS returning nothing is an empty list, not an error. A real error
  // (connection, malformed query) must not be swallowed into "no files" —
  // that would quietly show an empty tab on a lead that has documents.
  if (error) throw new Error(`Could not list attachments: ${error.message}`);
  return (data ?? []) as AttachmentRow[];
}

/**
 * The signed instalment agreement for one lead, or null.
 *
 * Accounts needs this on the enrolment screen — they are the ones chasing
 * the instalments the agreement sets out, and until now the only copy was
 * on the lead page they have no reason to open. They hold `file.read` at
 * centre scope, so the same RLS policy that shows the counsellor this file
 * shows it to them; nothing here is a special case for accounts.
 */
export async function getSignedAgreement(
  supabase: SupabaseClient,
  leadId: string,
): Promise<AttachmentRow | null> {
  const rows = await listAttachments(supabase, { kind: "lead", id: leadId });
  return currentSignedAgreement(rows);
}

/** Signed URLs expire; 5 minutes is long enough to open, short enough that a copied link dies quickly. */
export const SIGNED_URL_TTL_SECONDS = 300;

export async function createSignedUrl(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error) return null;
  return data?.signedUrl ?? null;
}
