import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The files students attached to their own profile forms, ready to link.
 *
 * `profile_form_data` holds a filename for a `file` question, which is not
 * something anybody can click. The file itself is an `attachments` row
 * carrying `field_key` — the question it answers — so this resolves one to
 * the other for a whole page of leads in a single query.
 *
 * Read through the caller's RLS-bound client, so the same policies that
 * decide which leads appear in the list decide which files come back with
 * them. Nothing here filters by centre or owner; the database does.
 */

export interface ProfileFormFile {
  attachmentId: string;
  /** `field_definitions.key` of the question this answers. */
  fieldKey: string;
  fileName: string;
}

interface Row {
  id: string;
  lead_id: string;
  field_key: string;
  file_name: string;
}

/** leadId → the files that lead's student uploaded, oldest question first. */
export async function listProfileFormFiles(
  supabase: SupabaseClient,
  leadIds: readonly string[],
): Promise<Record<string, ProfileFormFile[]>> {
  if (leadIds.length === 0) return {};

  const { data, error } = await supabase
    .from("attachments")
    .select("id, lead_id, field_key, file_name")
    .in("lead_id", [...leadIds])
    .not("field_key", "is", null)
    .is("deleted_at", null)
    .order("created_at")
    .returns<Row[]>();

  // A failure here must not blank the whole list — the answers are still
  // worth reading without the links. An empty result from RLS is not a
  // failure and arrives as an empty array.
  if (error) return {};

  const byLead: Record<string, ProfileFormFile[]> = {};
  for (const row of data ?? []) {
    (byLead[row.lead_id] ??= []).push({
      attachmentId: row.id,
      fieldKey: row.field_key,
      fileName: row.file_name,
    });
  }
  return byLead;
}
