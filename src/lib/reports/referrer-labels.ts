import "server-only";

import { and, inArray, isNull } from "drizzle-orm";

import type { SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { leads } from "@/lib/db/schema";
import { reportScopeFor } from "@/lib/reports/load-report-leads";

/**
 * Turning referrer ids into something a human can read — carefully.
 *
 * A leaderboard of uuids is useless: the point of the referral report is
 * that a counsellor can ring the person who sent four students and thank
 * them. But `report.read` is deliberately wider than `lead.read` (academics
 * hold it and cannot see a single lead), and the report screens are built
 * on a direct, RLS-bypassing client, so a name cannot simply be selected
 * here and shown to whoever asked.
 *
 * So this resolves a name only where the caller could have read that lead
 * anyway — the `lead.read` permission AND the same centre/owner scope the
 * report itself uses. Everybody else gets the lead number, which is enough
 * to rank a leaderboard and identifies nobody. No phone numbers in either
 * case: CLAUDE.md § 6, and a leaderboard is bulk by definition.
 */

export interface ReferrerLabel {
  id: string;
  /** A name where allowed, otherwise `Lead #214`. */
  label: string;
  leadNumber: number;
  /** True when the label is a real name — the page links to the lead only then. */
  named: boolean;
}

export async function loadReferrerLabels(
  user: SessionUser,
  referrerIds: string[],
): Promise<Map<string, ReferrerLabel>> {
  const unique = [...new Set(referrerIds)].filter(Boolean);
  if (unique.length === 0) return new Map();

  const rows = await db
    .select({
      id: leads.id,
      leadNumber: leads.leadNumber,
      studentName: leads.studentName,
      centerId: leads.centerId,
      assignedTo: leads.assignedTo,
    })
    .from(leads)
    .where(and(inArray(leads.id, unique), isNull(leads.deletedAt)));

  const scope = reportScopeFor(user);
  const mayName = can(user, "lead.read");
  const centerIds = new Set(user.centerIds);

  return new Map(
    rows.map((row) => {
      const inScope =
        scope === "all"
          ? true
          : scope === "center"
            ? row.centerId !== null && centerIds.has(row.centerId)
            : row.assignedTo === user.id;
      const named = mayName && inScope;
      return [
        row.id,
        {
          id: row.id,
          label: named ? row.studentName : `Lead #${row.leadNumber}`,
          leadNumber: row.leadNumber,
          named,
        },
      ];
    }),
  );
}
