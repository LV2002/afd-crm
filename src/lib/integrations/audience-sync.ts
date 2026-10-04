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
  /** When they first arrived. */
  createdAt: string | Date | null;
  /** The last thing that happened on the lead — a call logged, a message, a stage change. */
  lastActivityAt: string | Date | null;
}

export interface RetargetingWindow {
  /** How recent a lead has to be to stay in the audience. 0 or null means every lead, ever. */
  windowDays: number | null;
  /** Injected so the rule is testable against fixed dates rather than whenever the suite runs. */
  now?: Date;
}

/** The number of days a lead is kept in the ad platforms' audiences by default — see `isWithinRetargetingWindow`. */
export const DEFAULT_RETARGETING_WINDOW_DAYS = 180;

function toTime(value: string | Date | null): number | null {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * Recency. "I would like my last 6 months of leads to be sent back to
 * Meta as a custom audience" — Leon, 4 October 2026.
 *
 * The sync had no window at all: every consenting lead the CRM had ever
 * held stayed in the audience forever. Which is not only a budget
 * question. Somebody who enquired about a 2024 batch, sat their exam and
 * moved on is a person the institute is still paying to show ads to, two
 * years later, about a course they no longer want.
 *
 * ## Recent by what date
 *
 * The later of **when they arrived** and **the last thing that happened
 * on the lead**, not arrival alone. A lead from eight months ago whose
 * counsellor spoke to them last week is live work, and dropping them out
 * of the audience mid-conversation is the opposite of what the window is
 * for. The cost of this choice is stated plainly because it is real: a
 * lead can be kept in the audience by internal activity the lead knows
 * nothing about. That is the right trade for a sales pipeline where the
 * follow-up cycle genuinely runs for months.
 *
 * A null window (or 0) keeps the old behaviour — every lead, no cutoff —
 * because an institute that wants that should be able to have it by
 * setting it, not by this rule not existing.
 */
export function isWithinRetargetingWindow(
  lead: Pick<RetargetingCandidate, "createdAt" | "lastActivityAt">,
  window: RetargetingWindow,
): boolean {
  const windowDays = window.windowDays;
  if (!windowDays || windowDays <= 0) return true;

  const cutoff = (window.now ?? new Date()).getTime() - windowDays * 86_400_000;
  const createdAt = toTime(lead.createdAt);
  const lastActivityAt = toTime(lead.lastActivityAt);

  // Neither date readable — a row that predates the columns, or a bad
  // import. Kept, deliberately: consent is the gate that matters for
  // whether somebody may be advertised to at all, and a missing
  // timestamp is not evidence of age.
  if (createdAt === null && lastActivityAt === null) return true;

  return Math.max(createdAt ?? 0, lastActivityAt ?? 0) >= cutoff;
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
export function isRetargetingEligible(
  lead: RetargetingCandidate,
  window: RetargetingWindow = { windowDays: DEFAULT_RETARGETING_WINDOW_DAYS },
): boolean {
  if (lead.deletedAt) return false;
  if (lead.doNotContact) return false;
  if (lead.optedOutChannels && lead.optedOutChannels.length > 0) return false;
  if (lead.consentStatus !== "given") return false;
  if (!lead.primaryPhone && !lead.email) return false;
  if (!isWithinRetargetingWindow(lead, window)) return false;
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
