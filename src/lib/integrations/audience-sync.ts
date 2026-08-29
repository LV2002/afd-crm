/**
 * Pure eligibility + diff logic for the retargeting sync (Meta Custom
 * Audiences, Google Customer Match) — no DB access, so it's fully
 * unit-testable the same way normalizePhone()/the assignment evaluator
 * are (CLAUDE.md's testing list). The route handler fetches rows and
 * hands in plain data.
 */

export interface RetargetingCandidate {
  id: string;
  deletedAt: string | Date | null;
  consentStatus: string | null;
  doNotContact: boolean;
  optedOutChannels: string[] | null;
  primaryPhone: string | null;
  email: string | null;
}

/**
 * Deliberately strict: a lead with no recorded consent (`consentStatus`
 * null — every lead created before consent tracking existed, or any
 * import that didn't carry it) is EXCLUDED, not assumed consenting.
 * Uploading someone's phone number to an ad platform is not the place to
 * default open on an absent value. `optedOutChannels` being non-empty
 * excludes regardless of which channel it names — there's no seeded
 * vocabulary distinguishing "opted out of WhatsApp" from "opted out of
 * ads" yet (see docs/DECISIONS.md), so treating any opt-out as blocking
 * every channel is the conservative, correct default until that
 * vocabulary exists.
 */
export function isRetargetingEligible(lead: RetargetingCandidate): boolean {
  if (lead.deletedAt) return false;
  if (lead.doNotContact) return false;
  if (lead.optedOutChannels && lead.optedOutChannels.length > 0) return false;
  if (lead.consentStatus !== "given") return false;
  if (!lead.primaryPhone && !lead.email) return false;
  return true;
}

export interface AudienceDiff {
  toAdd: string[];
  toRemove: string[];
}

/**
 * `toAdd`/`toRemove` are lead ids, not platform-side identifiers — the
 * caller looks up phone/email (and hashes them) only for the ids actually
 * being added, so a lead that's neither newly eligible nor newly
 * ineligible costs nothing on a given day's run.
 */
export function computeAudienceDiff(eligibleLeadIds: string[], currentlySyncedLeadIds: string[]): AudienceDiff {
  const syncedSet = new Set(currentlySyncedLeadIds);
  const eligibleSet = new Set(eligibleLeadIds);
  return {
    toAdd: eligibleLeadIds.filter((id) => !syncedSet.has(id)),
    toRemove: currentlySyncedLeadIds.filter((id) => !eligibleSet.has(id)),
  };
}
