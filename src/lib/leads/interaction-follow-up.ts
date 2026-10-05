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
 * The one exemption is the conversation that has nowhere left to go. When
 * the outcome is **converted**, the student has joined — there is no next
 * call to schedule, and demanding one would have counsellors typing
 * "nothing" into a field forever, which is worse than not asking.
 *
 * ## Why a value is named in code
 *
 * CLAUDE.md §10 says lists belong in the database, and the outcomes do:
 * they are `dropdown_options` rows an admin can rename, reorder and add
 * to. What is keyed on here is the **value**, not the label — the stable
 * identifier of a row in a *system* category, the same relationship
 * `stage_type = 'won'` has to a stage an admin may call anything. An
 * institute can rename "Converted" to "Joined" and this keeps working; it
 * is only deleting the row outright that would turn the exemption off,
 * and then every interaction simply needs a follow-up, which is the safe
 * direction to fail in.
 */
export const CONVERTED_OUTCOME = "converted";

/**
 * Does this interaction have to say what happens next?
 *
 * `null` for an outcome nobody chose: an unanswered call still needs a
 * follow-up, and treating "not stated" as an exemption would make the
 * rule trivially avoidable by leaving the dropdown alone.
 */
export function needsFollowUp(outcome: string | null | undefined): boolean {
  return (outcome ?? "") !== CONVERTED_OUTCOME;
}
