import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Which of these leads belong to a student who dropped out.
 *
 * A drop is recorded on the `enrolments` row and, deliberately, nothing
 * is written back to `leads` — the sales record stops changing at Gate 1
 * (CLAUDE.md § lifecycle chain), and rewriting it would claim the
 * admission never happened. The lead genuinely did convert; the student
 * then left. Both are true and the funnel has to keep saying so.
 *
 * The consequence was that only the lead's own detail page knew. On the
 * pipeline board and the leads list a dropped student sat in Won looking
 * exactly like one who is still attending, so the two screens a
 * counsellor actually works from were the two that could not tell.
 *
 * So: displayed by reading the enrolment, which is what the design
 * always said, and this is the read. Scoped to the leads already on the
 * page — never a scan of every enrolment the institute has ever taken.
 *
 * Runs on the caller's own RLS-bound client. Someone without
 * `enrolment.read` simply gets an empty set and no badge, which is the
 * same rule the lead page already applies to the admission panel.
 */
export async function droppedLeadIds(
  supabase: SupabaseClient,
  leadIds: string[],
): Promise<Set<string>> {
  if (leadIds.length === 0) return new Set();

  const { data } = await supabase
    .from("enrolments")
    .select("lead_id")
    .in("lead_id", leadIds)
    .not("dropped_at", "is", null)
    .is("deleted_at", null)
    .returns<Array<{ lead_id: string }>>();

  return new Set((data ?? []).map((row) => row.lead_id));
}
