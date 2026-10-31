import { and, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { enrolments, leads } from "@/lib/db/schema";

import type { RetargetingCandidate } from "./audience-sync";

/**
 * Every lead, as the retargeting sync sees it — shared by the Meta and
 * Google routes so the two cannot disagree about who is in an audience.
 *
 * `hasAdmission` is true for a lead with a confirmed enrolment (the
 * sales→accounts gate has passed) that has not been deleted. A student who
 * has since dropped still counts: see `isRetargetingEligible`.
 *
 * Direct db client: these are cron routes with no session, the one place
 * CLAUDE.md non-negotiable #3 allows it.
 */
export async function loadRetargetingCandidates(): Promise<RetargetingCandidate[]> {
  const [rows, admitted] = await Promise.all([
    db
      .select({
        id: leads.id,
        deletedAt: leads.deletedAt,
        consentStatus: leads.consentStatus,
        doNotContact: leads.doNotContact,
        optedOutChannels: leads.optedOutChannels,
        primaryPhone: leads.primaryPhone,
        email: leads.email,
        createdAt: leads.createdAt,
        lastActivityAt: leads.lastActivityAt,
      })
      .from(leads),
    db
      .select({ leadId: enrolments.leadId })
      .from(enrolments)
      .where(and(isNull(enrolments.deletedAt), isNotNull(enrolments.salesToAccountsAt))),
  ]);

  const admittedIds = new Set(admitted.map((row) => row.leadId));
  return rows.map((row) => ({ ...row, hasAdmission: admittedIds.has(row.id) }));
}
