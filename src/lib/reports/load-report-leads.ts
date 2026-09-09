import "server-only";

import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import type { SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { enquiries, enrolments, leads } from "@/lib/db/schema";
import { formatDateIST } from "@/lib/format/date";

/**
 * The one read behind the three analysis screens.
 *
 * Attribution, cohorts and segments all want the same thing — every lead
 * the caller may see, the day they arrived, and whether they were
 * admitted — and writing that query three times is how three pages end up
 * with three slightly different definitions of "converted". There is one
 * definition, and it lives here.
 *
 * ## Why the direct client
 *
 * Same reasoning as the Insights pivot, and it is deliberate rather than
 * convenient: `report.read` is meant to grant *aggregate counts* to roles
 * that do not hold `lead.read` at all — accounts and academics — so an
 * RLS-bound read would return nothing for exactly the people these
 * screens are for. The trade is that the centre scope RLS would have
 * enforced has to be enforced here instead, in `scopeWhere` below, and
 * that no column carrying PII is ever selected: no name, no phone, no
 * email. Nothing on these screens is row-level.
 */

export interface ReportLead {
  id: string;
  /** `yyyy-MM-dd` in IST — the day of the FIRST enquiry, not of the row's creation. */
  arrivedOn: string;
  firstTouchSource: string | null;
  lastTouchSource: string | null;
  district: string | null;
  state: string | null;
  city: string | null;
  schoolCollege: string | null;
  board: string | null;
  educationStatus: string | null;
  examYear: string | null;
  /** Past the sales→accounts gate and not since dropped. */
  admitted: boolean;
  /** `yyyy-MM-dd` in IST of that gate, or null. */
  admittedOn: string | null;
}

export type ReportScope = "all" | "center" | "own";

export function reportScopeFor(user: SessionUser): ReportScope {
  // Three separate permission codes, widest wins — the same rule the
  // Insights pivot uses. Kept identical on purpose: two reporting screens
  // that disagree about who sees what is a bug nobody notices for months.
  return can(user, "report.org") ? "all" : can(user, "report.center") ? "center" : "own";
}

export async function loadReportLeads(user: SessionUser): Promise<ReportLead[]> {
  const scope = reportScopeFor(user);

  const scopeWhere =
    scope === "all"
      ? isNull(leads.deletedAt)
      : scope === "center"
        ? and(isNull(leads.deletedAt), inArray(leads.centerId, user.centerIds))
        : and(isNull(leads.deletedAt), eq(leads.assignedTo, user.id));

  const rows = await db
    .select({
      id: leads.id,
      createdAt: leads.createdAt,
      firstTouchSource: leads.firstTouchSource,
      lastTouchSource: leads.lastTouchSource,
      district: leads.district,
      state: leads.state,
      city: leads.city,
      schoolCollege: leads.schoolCollege,
      board: leads.board,
      educationStatus: leads.educationStatus,
      examYear: leads.examYear,
    })
    .from(leads)
    .where(scopeWhere);

  if (rows.length === 0) return [];

  const leadIds = rows.map((row) => row.id);

  // The first enquiry, not the lead row's own created_at. An imported
  // lead carries its real enquiry date; measuring from the import would
  // put a decade of history into one cohort.
  const firstEnquiries = await db
    .select({
      leadId: enquiries.leadId,
      firstAt: sql<Date>`min(${enquiries.createdAt})`.as("first_at"),
    })
    .from(enquiries)
    .where(inArray(enquiries.leadId, leadIds))
    .groupBy(enquiries.leadId);

  const arrivedAt = new Map(firstEnquiries.map((row) => [row.leadId, row.firstAt]));

  // Lead ids and one timestamp. Nothing here that a counts-only screen
  // could not already count.
  const admissions = await db
    .select({ leadId: enrolments.leadId, confirmedAt: enrolments.salesToAccountsAt })
    .from(enrolments)
    .where(
      and(
        inArray(enrolments.leadId, leadIds),
        isNotNull(enrolments.salesToAccountsAt),
        isNull(enrolments.droppedAt),
        isNull(enrolments.deletedAt),
      ),
    );

  // Earliest confirmation wins: a lead who enrolled, dropped and enrolled
  // again is one admission, dated when they first said yes.
  const admittedAt = new Map<string, Date>();
  for (const row of admissions) {
    if (!row.confirmedAt) continue;
    const existing = admittedAt.get(row.leadId);
    if (!existing || row.confirmedAt < existing) admittedAt.set(row.leadId, row.confirmedAt);
  }

  return rows.map((row) => {
    const admitted = admittedAt.get(row.id) ?? null;
    return {
      id: row.id,
      arrivedOn: dayIST(arrivedAt.get(row.id) ?? row.createdAt),
      firstTouchSource: row.firstTouchSource,
      lastTouchSource: row.lastTouchSource,
      district: row.district,
      state: row.state,
      city: row.city,
      schoolCollege: row.schoolCollege,
      board: row.board,
      educationStatus: row.educationStatus,
      examYear: row.examYear,
      admitted: admitted !== null,
      admittedOn: admitted ? dayIST(admitted) : null,
    };
  });
}

/** Calendar days are Kochi's, not the server's. A UTC date would move an evening enquiry into yesterday. */
function dayIST(value: Date | string): string {
  return formatDateIST(value, "yyyy-MM-dd");
}
