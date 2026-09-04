/**
 * Who gets told, worked out as pure logic so the rules are testable
 * without a database. The queries that supply the inputs live in
 * `notify.ts`.
 *
 * Three rules, and the third is the one that matters:
 *
 *  1. The roles the admin picked for this event.
 *  2. The lead's own owner, if the admin switched that on.
 *  3. Nobody hears about something they could not open anyway.
 *
 * Rule 3 exists because a notification carries the student's name in its
 * copy. Without it, a Kannur centre head would be told about every Kochi
 * breach — which is both noise and a quiet leak of exactly the kind of
 * per-centre data the RLS policies spend their whole existence enforcing.
 * The owner is exempt: it is their lead.
 */

export interface RecipientCandidate {
  userId: string;
  roleId: string;
  /** Centres this person is assigned to, via user_centers. */
  centerIds: string[];
  /** True if their role holds lead.read at scope `all` — an org-wide reader. */
  seesAllCenters: boolean;
}

export interface RecipientRules {
  /** Role ids the admin chose for this event. */
  notifyRoles: string[];
  notifyOwner: boolean;
}

export interface RecipientInput {
  rules: RecipientRules;
  candidates: RecipientCandidate[];
  /** The lead's assigned counsellor, if it has one. */
  ownerId?: string | null;
  /** Whoever performed the action. Never notified about their own doing. */
  actorId?: string | null;
  /** The centre the subject belongs to. Null means org-wide: nobody is filtered out. */
  centerId?: string | null;
}

export function resolveRecipients(input: RecipientInput): string[] {
  const { rules, candidates, ownerId, actorId, centerId } = input;
  const recipients = new Set<string>();

  if (rules.notifyRoles.length > 0) {
    const wanted = new Set(rules.notifyRoles);
    for (const candidate of candidates) {
      if (!wanted.has(candidate.roleId)) continue;
      if (!canSee(candidate, centerId)) continue;
      recipients.add(candidate.userId);
    }
  }

  // The owner is added last and unconditionally: it is their lead, so the
  // centre test cannot exclude them, and a lead assigned to someone outside
  // its centre is a data problem to fix rather than a reason to leave the
  // person holding it uninformed.
  if (rules.notifyOwner && ownerId) {
    recipients.add(ownerId);
  }

  // "You confirmed this admission" is not news. Removed at the end so it
  // applies however the person got onto the list.
  if (actorId) recipients.delete(actorId);

  return [...recipients];
}

function canSee(candidate: RecipientCandidate, centerId: string | null | undefined): boolean {
  if (!centerId) return true;
  if (candidate.seesAllCenters) return true;
  return candidate.centerIds.includes(centerId);
}
