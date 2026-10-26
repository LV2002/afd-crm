import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { batches, centers } from "@/lib/db/schema";

import type { AdmissionBatchOption } from "@/app/(app)/leads/[id]/confirm-admission-form";

/**
 * The batches a counsellor may put this admission into.
 *
 * Scoped to the lead's own centre: a Kochi student joining a Kannur batch is
 * almost always a mis-click, and the ones that are not go through an admin
 * changing the batch afterwards rather than through a picker that offers
 * every batch in the institute.
 *
 * Read on the direct client rather than through PostgREST. It used to go
 * through the RLS-bound client, which returned an empty list — silently — any
 * time the API's schema cache lagged behind a migration (a new batches
 * column made the whole select fail and the error was dropped), so a batch
 * that plainly existed in Settings never showed up here. Callers have already
 * checked the user may see this lead or student, and a batch name and fee are
 * not sensitive.
 *
 * `spacesLeft` is a live count rather than a stored number, same as the
 * batches list: a stored count goes wrong silently the first time somebody
 * leaves. Null means the batch has no seat limit.
 */
export async function getBatchOptionsForCentre(
  centerId: string | null,
): Promise<AdmissionBatchOption[]> {
  if (!centerId) return [];
  return loadBatchOptions(eq(batches.centerId, centerId));
}

/**
 * Every running batch, at any centre, for confirming an admission.
 *
 * The batch decides where the student studies, so the admission form offers
 * all of them — each labelled with its centre — rather than only the lead's
 * own. A lead's centre is where they enquired, which is often not where they
 * end up, and a lead with no centre at all was getting an empty picker.
 */
export async function getAllBatchOptions(): Promise<AdmissionBatchOption[]> {
  return loadBatchOptions(undefined);
}

async function loadBatchOptions(centreFilter: ReturnType<typeof eq> | undefined) {
  const rows = await db
    .select({
      id: batches.id,
      centerName: centers.name,
      name: batches.name,
      course: batches.course,
      mode: batches.mode,
      academicYear: batches.academicYear,
      feePaise: batches.feePaise,
      capacity: batches.capacity,
      filled: sql<number>`(
        select count(*)::int from student_batches sb
        where sb.batch_id = ${batches.id} and sb.left_at is null
      )`,
    })
    .from(batches)
    .leftJoin(centers, eq(centers.id, batches.centerId))
    .where(and(centreFilter, eq(batches.isActive, true), isNull(batches.deletedAt)))
    .orderBy(asc(batches.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    centerName: row.centerName,
    course: row.course,
    mode: row.mode,
    academicYear: row.academicYear,
    feePaise: row.feePaise,
    // Never negative on the label: a batch one over its limit should read
    // "0 left", not "-1 left". Going over is warned about elsewhere, not
    // blocked — rooms take one more chair. Null means no seat limit.
    spacesLeft: row.capacity === null ? null : Math.max(0, row.capacity - row.filled),
  }));
}
