/**
 * Deciding when two failures are the same failure, and when to say so.
 *
 * The point of error alerting is that somebody finds out. The way error
 * alerting fails is that somebody finds out four hundred times in an
 * hour, turns the emails into a filter rule, and then never finds out
 * about anything again.
 *
 * Both halves of that are decided here, and both are pure so they can be
 * tested without a database or a mail provider.
 */

/**
 * The parts of a message that vary between occurrences of one bug.
 *
 * "Lead 3f2a… not found" and "Lead 9b1c… not found" are one broken code
 * path, not two, and grouping them is the difference between an inbox
 * with one thing in it and an inbox with two hundred.
 */
function generalise(message: string): string {
  return message
    // Ids of every shape this system uses.
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<id>")
    .replace(/\bwamid\.[A-Za-z0-9_=-]+/g, "<wamid>")
    // Phone numbers and long digit runs — receipt numbers, amounts, epochs.
    .replace(/\+?\d[\d\s-]{6,}\d/g, "<number>")
    .replace(/\b\d{3,}\b/g, "<number>")
    // Quoted values: a rejected template name, a column, a person's name.
    .replace(/'[^']{1,80}'/g, "'<value>'")
    .replace(/"[^"]{1,80}"/g, '"<value>"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/**
 * A short stable id for "this kind of failure, from this place".
 *
 * FNV-1a rather than a crypto hash: this is a grouping key, not a
 * security boundary, and keeping it dependency-free keeps this module
 * pure and testable.
 */
export function fingerprintError(source: string, message: string): string {
  const input = `${source}::${generalise(message)}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Exported for the tests, and for anything that wants to show the grouped form. */
export const generaliseMessage = generalise;

/**
 * Whether this occurrence is worth an email.
 *
 * The first one always is — that is the whole point. After that, only at
 * ten times the count that was last reported, so a fault that fires
 * continuously produces roughly one message per order of magnitude
 * instead of one per failure. A storm that would have sent four hundred
 * emails sends three.
 */
export function shouldAlert(count: number, lastNotifiedCount: number | null): boolean {
  if (count <= 0) return false;
  if (lastNotifiedCount === null) return true;
  return count >= lastNotifiedCount * 10;
}

/** Everything a person needs to know from a subject line they read on a phone. */
export function alertSubject(source: string, message: string, count: number): string {
  const short = generalise(message).slice(0, 90);
  const times = count > 1 ? ` (${count}×)` : "";
  return `AFD CRM: ${source} — ${short}${times}`;
}
