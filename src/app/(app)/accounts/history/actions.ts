"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { centers, dropdownOptions } from "@/lib/db/schema";
import { confirmAdmission } from "@/lib/enrolment/confirm-admission";
import { courseModes } from "@/lib/enrolment/course-catalog";
import { parsePastAdmissions } from "@/lib/enrolment/parse-past-admissions";
import { resolveOrCreateLead } from "@/lib/identity/resolve-or-create-lead";
import { createClient } from "@/lib/supabase/server";

export interface HistoryImportState {
  error?: string;
  success?: string;
  problems?: Array<{ line: number; message: string }>;
}

const MAX_ROWS = 500;

/**
 * Past admissions, typed in once. Each person goes through the same
 * resolveOrCreateLead() as every other lead — a repeat phone number attaches
 * to the person already here instead of making a second one — and the
 * admission is the same confirmAdmission() every admission uses, marked
 * historical so nobody is notified, chased for money, or sent a welcome. The
 * fee defaults to nothing: the accountant fills in each schedule and payment
 * on the admission page.
 */
export async function importPastAdmissions(_prev: HistoryImportState, formData: FormData): Promise<HistoryImportState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return { error: "You don't have permission to do that." };

  const centerId = String(formData.get("centerId") ?? "");
  const academicYear = String(formData.get("academicYear") ?? "");
  const startYear = /^(\d{4})-\d{2}$/.exec(academicYear)?.[1];
  if (!startYear) return { error: "Choose the academic year." };
  const [centre] = await db.select({ id: centers.id }).from(centers).where(eq(centers.id, centerId));
  if (!centre) return { error: "Choose the centre." };

  const courseRows = await db
    .select({ value: dropdownOptions.value, label: dropdownOptions.label })
    .from(dropdownOptions)
    .where(and(eq(dropdownOptions.category, "course"), isNull(dropdownOptions.deletedAt)));
  const courseLookup = new Map<string, string>();
  for (const c of courseRows) {
    courseLookup.set(c.value.toLowerCase(), c.value);
    courseLookup.set(c.label.toLowerCase(), c.value);
  }

  const parsed = parsePastAdmissions(String(formData.get("rows") ?? ""), courseLookup);
  if (parsed.rows.length === 0 && parsed.problems.length === 0) return { error: "Paste at least one student." };
  if (parsed.rows.length > MAX_ROWS) return { error: `That is ${parsed.rows.length} students — add them in batches of ${MAX_ROWS}.` };

  const modes = await courseModes();
  const problems = [...parsed.problems];
  const supabase = await createClient();
  let added = 0;
  let attached = 0;

  for (const row of parsed.rows) {
    try {
      const lead = await resolveOrCreateLead({
        studentName: row.name,
        primaryPhone: row.phone,
        source: "Past admission",
        centerId,
        coursesInterested: [row.course],
        actorId: user.id,
        suppressArrivalNotice: true,
        historical: true,
      });
      const joined = new Date(`${row.joinedOn ?? `${startYear}-06-01`}T12:00:00+05:30`);
      const result = await db.transaction((tx) =>
        confirmAdmission(tx, {
          leadId: lead.leadId,
          course: row.course,
          centerId,
          mode: modes.get(row.course) ?? "hybrid",
          academicYear,
          totalFeePaiseOverride: row.feePaise ?? 0,
          confirmedBy: user.id,
          enrolledAt: joined,
          historical: true,
        }),
      );
      await writeAuditLog(supabase, {
        actorId: user.id,
        action: "enrolment.history_import",
        entityType: "enrolments",
        entityId: result.enrolmentId,
        after: { leadId: lead.leadId, course: row.course, academicYear, joinedOn: row.joinedOn },
      });
      added += 1;
      if (!lead.isNewLead) attached += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not add this one.";
      problems.push({
        line: row.line,
        message: /already has an enrolment/.test(msg) ? "Already has an admission — left as it is." : msg,
      });
    }
  }

  revalidatePath("/accounts");
  problems.sort((a, b) => a.line - b.line);
  return {
    success:
      `${added} admission${added === 1 ? "" : "s"} added` +
      (attached ? ` (${attached} matched someone already in the CRM by phone number)` : "") +
      `.${problems.length ? ` ${problems.length} line${problems.length === 1 ? " was" : "s were"} not added — see below.` : ""}`,
    problems,
  };
}
