/**
 * Small pure rules behind the dropdown editor, kept apart so they can be tested.
 */

/**
 * A stored value made from what somebody typed as the label.
 *
 * The value is the machine name a lead remembers ("saudi_arabia"); nobody
 * should have to invent one. "Saudi Arabia" becomes `saudi_arabia`, and an
 * "A+" or a name that starts with a digit still comes out as a legal value.
 */
export function slugifyValue(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  if (!slug) return "";
  return /^[a-z]/.test(slug) ? slug : `o_${slug}`;
}

/** The pattern a stored value has to match. */
export const OPTION_VALUE_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * The order after moving one option a place up or down, or null if it cannot move.
 *
 * Works on the WHOLE ordered list and returns the new order, so the caller
 * writes 0..n-1 back. Swapping two stored `sort_order` numbers — what this
 * replaces — silently did nothing whenever the two were equal, which they are
 * for every source a custom endpoint added (each was written as 100), and
 * whenever the neighbour was a deleted option the screen no longer shows.
 */
export function movedOrder(ids: readonly string[], id: string, direction: "up" | "down"): string[] | null {
  const index = ids.indexOf(id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= ids.length) return null;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
