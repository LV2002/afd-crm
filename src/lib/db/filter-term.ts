/**
 * Making a user's search box safe to paste into a PostgREST filter string.
 *
 * Supabase's `.or()` takes a filter *expression* as a single string —
 * `student_name.ilike.%anj%,primary_phone.ilike.%anj%` — and the client
 * does not escape what you interpolate into it. Commas separate clauses,
 * parentheses group them, and dots separate column from operator from
 * value, so a search for `x,phone.ilike.%9%` becomes a second clause
 * rather than a search for that text.
 *
 * Row-level security still holds — nobody sees a row they could not see
 * anyway — so this is not a data-leak hole. What it is: a way for anybody
 * with a search box to bend the query into shapes it was never meant to
 * take, including malformed ones that just error.
 *
 * Stripping rather than escaping, deliberately. PostgREST has no quoting
 * syntax that survives every position in a filter string, and none of
 * these characters is meaningful in a name, a phone number or a student
 * code. `%` and `*` go too: both are wildcards inside `ilike`, so leaving
 * them lets a search of `%` match the entire table.
 *
 * Security audit 2026-09-15, finding #12.
 */

const FILTER_METACHARACTERS = /[,()%*\\."']/g;

export function filterTerm(raw: string): string {
  return raw.replace(FILTER_METACHARACTERS, " ").replace(/\s+/g, " ").trim();
}
