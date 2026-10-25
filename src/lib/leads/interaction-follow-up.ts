/**
 * When an interaction has to say what happens next.
 *
 * ## The rule
 *
 * Every logged interaction needs a **next action** and a **date for it**.
 * A call that ends with nothing scheduled is a lead that quietly stops
 * being worked: nothing surfaces it in the morning queue, nothing breaches
 * an SLA, and it is discovered months later in a list of leads nobody
 * touched. Requiring the date is what turns the interaction log from a
 * diary into a work queue.
 *
 * The exemption is the conversation that has nowhere left to go:
 *
 * - **converted** — the student has joined.
 * - **not interested** — they said no; there is nothing to call back about.
 * - **dropped** — the lead is no longer being pursued.
 * - **wrong target audience** — not who the institute teaches.
 *
 * Demanding a next call for any of these would have counsellors typing
 * "nothing" into a field forever, which is worse than not asking.
 *
 * ## Why values are named in code
 *
 * CLAUDE.md §10 says lists belong in the database, and the outcomes do:
 * they are `dropdown_options` rows an admin can rename, reorder and add
 * to. What is keyed on here is the **value**, not the label — the stable
 * identifier of a row in a *system* category, the same relationship
 * `kind = 'won'` has to a temperature an admin may call anything. An
 * institute can rename "Converted" to "Joined" and this keeps working; it
 * is only deleting a row outright that would turn its exemption off, and
 * then every interaction simply needs a follow-up, which is the safe
 * direction to fail in.
 *
 * The same list is in the CHECK constraint on `interactions` (migration
 * 0100), because a form alone is not enforcement.
 */
export const NO_FOLLOW_UP_OUTCOMES = [
  "converted",
  "not_interested",
  "dropped",
  "wrong_target_audience",
] as const;

/** Kept for callers that mean specifically "they joined". */
export const CONVERTED_OUTCOME = "converted";

/**
 * Does this interaction have to say what happens next?
 *
 * `null` for an outcome nobody chose: an unanswered call still needs a
 * follow-up, and treating "not stated" as an exemption would make the
 * rule trivially avoidable by leaving the dropdown alone.
 */
export function needsFollowUp(outcome: string | null | undefined): boolean {
  return !(NO_FOLLOW_UP_OUTCOMES as readonly string[]).includes(outcome ?? "");
}

/**
 * What a logged interaction does to the lead's single "next follow-up".
 *
 * A lead carries ONE follow-up date, and the newest interaction owns it:
 *
 * - it names a date → that becomes the lead's follow-up, replacing the old
 *   one, which is how "I called on the 15th and booked the 20th" closes the
 *   14th;
 * - it names none and the conversation is over (converted, not interested,
 *   dropped, wrong target audience) → the date is cleared. Leaving the old
 *   one meant a lead that had just said no sat in the follow-up queue as
 *   overdue until somebody noticed;
 * - it names none and the conversation is NOT over → impossible through the
 *   form (a date is required), so nothing changes rather than guessing.
 */
export function nextFollowupUpdate(
  outcome: string | null,
  nextFollowupAt: string | null,
): { set: string } | { clear: true } | null {
  if (nextFollowupAt) return { set: nextFollowupAt };
  if (!needsFollowUp(outcome)) return { clear: true };
  return null;
}
