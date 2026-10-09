/**
 * Which temperatures mean "still interested".
 *
 * Leon's definition, in his words: *"Interested (which is anyone in Very
 * Hot, Hot or Warm)"*. Asked whether to infer it instead — anything that
 * is not Cold or Dead — he chose the explicit three.
 *
 * ## Why this is a hardcoded list in a configurable system
 *
 * Temperature values are admin-editable (CLAUDE.md § What is
 * configurable), and this is the second place in the codebase where one
 * of them carries behaviour; `DEAD_TEMPERATURE` in `no-longer-worked.ts`
 * is the first, and the reasoning is the same. Renaming the **label**
 * changes nothing here — call it "Very warm" or "Keen" and the tile
 * still counts it — because the match is on the stored value, the way
 * the stage rules match on `stage_type` rather than on a stage's name.
 *
 * ## Matched loosely on purpose
 *
 * `very_hot`, `very-hot`, `veryhot` and `Very Hot` are one value typed
 * four ways, and which one an institute ends up with depends on who
 * added the option and what the form did with the spacing. Comparing a
 * normalised form costs nothing and removes a whole class of "the tile
 * says zero and I can see three hot leads".
 *
 * A value that is not in this list is simply not counted, which is the
 * failure worth naming: if an admin adds a fifth temperature meaning
 * "very keen", it will not appear in this tile until it is added here.
 * The dashboard says which temperatures it counted, so that shows up on
 * screen rather than as a quietly low number.
 */

export const INTERESTED_TEMPERATURES = ["very_hot", "hot", "warm"] as const;

/** `Very Hot`, `very-hot` and `veryhot` are the same stored value. */
function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const INTERESTED = new Set(INTERESTED_TEMPERATURES.map(normalise));

export function isInterestedTemperature(temperature: string | null | undefined): boolean {
  if (!temperature) return false;
  return INTERESTED.has(normalise(temperature));
}
