import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdmissionBatchOption } from "@/app/(app)/leads/[id]/confirm-admission-form";

/**
 * The batches a counsellor may put this admission into.
 *
 * Scoped to the lead's own centre: a Kochi student joining a Kannur batch is
 * almost always a mis-click, and the ones that are not go through an admin
 * changing the batch afterwards rather than through a picker that offers
 * every batch in the institute.
 *
 * Runs through the RLS-bound client, so a counsellor only ever sees batches
 * at centres their role allows anyway — the centre filter here is about
 * showing a short, correct list, not about access.
 *
 * `spacesLeft` is a live count rather than a stored number, same as the
 * batches list: a stored count goes wrong silently the first time somebody
 * leaves. Null means the batch has no seat limit.
 */
export async function getBatchOptionsForCentre(
  supabase: SupabaseClient,
  centerId: string | null,
): Promise<AdmissionBatchOption[]> {
  if (!centerId) return [];

  const { data } = await supabase
    .from("batches")
    .select("id, name, course, academic_year, capacity, student_batches(id)")
    .eq("center_id", centerId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("name")
    .returns<
      Array<{
        id: string;
        name: string;
        course: string;
        academic_year: string;
        capacity: number | null;
        student_batches: Array<{ id: string }> | null;
      }>
    >();

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    course: row.course,
    academicYear: row.academic_year,
    spacesLeft:
      row.capacity === null
        ? null
        : // Never negative on the label: a batch one over its limit should
          // read "0 left", not "-1 left". Going over is warned about
          // elsewhere, not blocked — rooms take one more chair.
          Math.max(0, row.capacity - (row.student_batches?.length ?? 0)),
  }));
}
