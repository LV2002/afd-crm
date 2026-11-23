/**
 * Which phone number on a WhatsApp Business Account the counsellor just
 * connected, when Meta did not say.
 *
 * Meta's Coexistence finish can name the account but not the number (the
 * number is attached after the QR code is scanned). The account's own number
 * list is then the only source: take every number on it that the CRM does
 * not already know about, and the institute's API number is never a candidate.
 * Exactly one left is the answer; none or several is a question for a person,
 * not a guess.
 */
export interface AccountNumber {
  id: string;
  displayPhoneNumber: string | null;
  /** The account the number sits on, when more than one account is in play. */
  wabaId?: string;
}

export function pickNewNumber<T extends AccountNumber>(
  onAccount: T[],
  alreadyKnownIds: Array<string | null | undefined>,
): { chosen: T | null; candidates: T[] } {
  const known = new Set(alreadyKnownIds.filter((id): id is string => Boolean(id)));
  const candidates = onAccount.filter((n) => !known.has(n.id));
  return { chosen: candidates.length === 1 ? candidates[0] : null, candidates };
}
