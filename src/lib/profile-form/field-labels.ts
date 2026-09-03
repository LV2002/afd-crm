import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * key -> label for the student field definitions, so a submitted profile
 * form reads as the questions it answered rather than as raw keys.
 *
 * Read live rather than hardcoded: an admin renaming a question in
 * Settings → Custom Fields should change how past submissions are
 * labelled too, since the answer is to that question either way.
 */
export async function getStudentFieldLabels(
  supabase: SupabaseClient,
): Promise<Record<string, string>> {
  const { data } = await supabase
    .from("field_definitions")
    .select("key, label")
    .eq("entity", "student")
    .is("deleted_at", null)
    .returns<Array<{ key: string; label: string }>>();

  return Object.fromEntries((data ?? []).map((row) => [row.key, row.label]));
}
