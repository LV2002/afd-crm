import { and, inArray, isNull, or, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { leadIdentifiers, leads, profiles } from "@/lib/db/schema";

export interface LeadRef {
  leadId: string;
  leadNumber: number;
  studentName: string;
  counsellorName: string | null;
}

export interface ContactIdentity {
  id: string;
  phone: string | null;
  email: string | null;
  /** The lead it was moved or merged into, when that has happened. */
  leadId: string | null;
}

export interface ContactLeadState {
  /** The lead this contact has been moved or merged into. */
  linked: LeadRef | null;
  /**
   * A lead that is the same person by phone or email, with no move or merge
   * done yet. This is what turns "Move to leads" into "Merge".
   */
  match: LeadRef | null;
}

/**
 * For a page of contacts: which are already leads.
 *
 * Read through `lead_identifiers`, where every phone and email the system has
 * ever seen for a person lives (including the second numbers a merge folded
 * in), so a contact is recognised by any number the lead has had, and a lead
 * created after the contact was imported is recognised too. It is computed
 * when the list is shown rather than stored: a stored flag would be wrong the
 * moment a lead arrived by any of the other ways in.
 *
 * Runs on the direct client because the question is "does this person exist",
 * not "may you see them". A counsellor who cannot read another counsellor's
 * lead still has to be told the contact is one, or they would create it twice
 * (non-negotiable #2 handles that safely, but the screen should say so). Only
 * the lead's number, name and counsellor leave this function.
 */
export async function leadStateFor(items: ContactIdentity[]): Promise<Map<string, ContactLeadState>> {
  const result = new Map<string, ContactLeadState>();
  if (items.length === 0) return result;

  const phones = [...new Set(items.map((i) => i.phone).filter((v): v is string => Boolean(v)))];
  const emails = [...new Set(items.map((i) => i.email).filter((v): v is string => Boolean(v)))];
  const linkedIds = [...new Set(items.map((i) => i.leadId).filter((v): v is string => Boolean(v)))];

  const refSelect = {
    leadId: leads.id,
    leadNumber: leads.leadNumber,
    studentName: leads.studentName,
    counsellorName: profiles.fullName,
  };

  const [byIdentifier, byLink] = await Promise.all([
    phones.length + emails.length === 0
      ? Promise.resolve([])
      : db
          .select({ ...refSelect, kind: leadIdentifiers.kind, value: leadIdentifiers.valueNormalised })
          .from(leadIdentifiers)
          .innerJoin(leads, eq(leads.id, leadIdentifiers.leadId))
          .leftJoin(profiles, eq(profiles.id, leads.assignedTo))
          .where(
            and(
              isNull(leadIdentifiers.deletedAt),
              isNull(leads.deletedAt),
              or(
                phones.length ? and(eq(leadIdentifiers.kind, "phone"), inArray(leadIdentifiers.valueNormalised, phones)) : undefined,
                emails.length ? and(eq(leadIdentifiers.kind, "email"), inArray(leadIdentifiers.valueNormalised, emails)) : undefined,
              ),
            ),
          ),
    linkedIds.length === 0
      ? Promise.resolve([])
      : db
          .select(refSelect)
          .from(leads)
          .leftJoin(profiles, eq(profiles.id, leads.assignedTo))
          .where(and(inArray(leads.id, linkedIds), isNull(leads.deletedAt))),
  ]);

  const phoneMap = new Map<string, LeadRef>();
  const emailMap = new Map<string, LeadRef>();
  for (const row of byIdentifier) {
    const ref: LeadRef = {
      leadId: row.leadId,
      leadNumber: row.leadNumber,
      studentName: row.studentName,
      counsellorName: row.counsellorName,
    };
    (row.kind === "phone" ? phoneMap : emailMap).set(row.value, ref);
  }
  const linkedMap = new Map<string, LeadRef>(byLink.map((row) => [row.leadId, row]));

  for (const item of items) {
    const linked = item.leadId ? (linkedMap.get(item.leadId) ?? null) : null;
    const match =
      (item.phone ? phoneMap.get(item.phone) : undefined) ??
      (item.email ? emailMap.get(item.email) : undefined) ??
      null;
    result.set(item.id, { linked, match: linked ? null : match });
  }
  return result;
}
