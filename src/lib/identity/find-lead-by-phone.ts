import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { leadIdentifiers, leads } from "@/lib/db/schema";

import { normalizePhone } from "./normalize-phone";

/**
 * Finds an existing lead by phone number — and never creates one.
 *
 * The deliberate counterpart to `resolveOrCreateLead()`. That function is
 * the one ingestion path every real enquiry goes through (CLAUDE.md
 * non-negotiable #8); this is for the case where an inbound message is
 * NOT an enquiry: a reply to a broadcast on the institute's WhatsApp
 * Business API number. AFD's enquiries arrive on the counsellors' own
 * phones and are typed in by hand, so a reply from an unknown number is
 * somebody who pressed a button, not a new prospect — and inventing a
 * lead for them would both pollute the pipeline and stamp "whatsapp" on
 * the first-touch source of someone who came from somewhere else.
 *
 * Matches through `lead_identifiers`, which is where every phone the
 * system has ever seen for a person lives — including the second and
 * third numbers a merge folded in — rather than `leads.primary_phone`
 * alone, so a reply from a parent's number still reaches the right lead.
 */

export interface MatchedLead {
  id: string;
  leadNumber: number;
  studentName: string;
  centerId: string | null;
  assignedTo: string | null;
}

export async function findLeadByPhone(rawPhone: string): Promise<MatchedLead | null> {
  const normalised = normalizePhone(rawPhone);
  if (!normalised) return null;

  const [row] = await db
    .select({
      id: leads.id,
      leadNumber: leads.leadNumber,
      studentName: leads.studentName,
      centerId: leads.centerId,
      assignedTo: leads.assignedTo,
      mergedIntoLeadId: leads.mergedIntoLeadId,
    })
    .from(leadIdentifiers)
    .innerJoin(leads, eq(leads.id, leadIdentifiers.leadId))
    .where(
      and(
        eq(leadIdentifiers.kind, "phone"),
        eq(leadIdentifiers.valueNormalised, normalised),
        isNull(leadIdentifiers.deletedAt),
        isNull(leads.deletedAt),
      ),
    )
    .limit(1);

  if (!row) return null;

  // A merged duplicate keeps its identifiers, so a reply can still land
  // on the record that was folded away. One hop is enough: a merge
  // always points at a surviving lead, never at another tombstone.
  if (row.mergedIntoLeadId) {
    const [survivor] = await db
      .select({
        id: leads.id,
        leadNumber: leads.leadNumber,
        studentName: leads.studentName,
        centerId: leads.centerId,
        assignedTo: leads.assignedTo,
      })
      .from(leads)
      .where(and(eq(leads.id, row.mergedIntoLeadId), isNull(leads.deletedAt)));
    if (survivor) return survivor;
  }

  return {
    id: row.id,
    leadNumber: row.leadNumber,
    studentName: row.studentName,
    centerId: row.centerId,
    assignedTo: row.assignedTo,
  };
}
