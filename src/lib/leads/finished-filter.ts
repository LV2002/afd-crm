/**
 * "Not finished with" — the PostgREST filter that keeps a list to leads
 * somebody is still working.
 *
 * A lead is finished when its temperature is Took admission or one of the
 * closing outcomes (Negative, Wrong target, AFD India student, Joined
 * competitor). Several screens need to leave those out — the overdue
 * catch-up list, Follow-ups, the orphan queue's badge — and each used to
 * rebuild the filter, from a list of terminal stages plus a separate
 * check for Dead. With one status there is one test, and one place that
 * writes it.
 *
 * ## A lead with no temperature is NOT finished
 *
 * `temperature.not.in.(…)` alone would drop NULLs (SQL's `NULL NOT IN`
 * is never true), and an unclassified lead is exactly the kind that needs
 * somebody to look at it. So the filter says so explicitly.
 *
 * ## Values are quoted
 *
 * They are slugs today, but they come from an admin-editable table and
 * this string is parsed by PostgREST. A value with a comma in it would
 * otherwise open a second clause, which is the same hazard
 * `lib/db/filter-term.ts` exists for.
 *
 * Pure, so the quoting is tested rather than trusted.
 */
export function unfinishedLeadsFilter(terminalValues: Iterable<string>): string | null {
  const quoted = [...terminalValues].map((value) => `"${value.replace(/["\\]/g, "\\$&")}"`);
  if (quoted.length === 0) return null;
  return `temperature.is.null,temperature.not.in.(${quoted.join(",")})`;
}
