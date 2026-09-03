import { and, eq, inArray, isNull, type SQL } from "drizzle-orm";

import type { SessionUser } from "@/lib/auth/session";
import { leads } from "@/lib/db/schema";

/**
 * Reads the permission map directly rather than importing `can()` from
 * `@/lib/auth/session`. That module is `server-only`, and a value import of
 * it would drag the marker into this file and into every test that exercises
 * scoping — the scoping rules are exactly what most deserves testing, so
 * they stay importable. The check is the same one `can()` performs: presence
 * of the code, not the scope recorded against it.
 */
function holds(user: SessionUser, code: string): boolean {
  return user.permissions[code as keyof typeof user.permissions] !== undefined;
}

/**
 * How much of the organisation a caller may be told about.
 *
 * Derived exactly as the Insights page derives it — the widest of the three
 * report.* codes the caller holds — so the analyst can never answer a
 * question with data the caller could not have seen by opening Insights
 * themselves. CLAUDE.md § AI analyst rules: "A centre head asking 'how did
 * Kochi do' when they only own Kannur must get nothing."
 */
export type AnalystScope = "all" | "center" | "own";

export function analystScope(user: SessionUser): AnalystScope {
  if (holds(user, "report.org")) return "all";
  if (holds(user, "report.center")) return "center";
  return "own";
}

/**
 * The lead filter every analyst tool must start from. There is one of
 * these, used by all of them, rather than each tool assembling its own
 * WHERE clause: a scoping rule that is written five times is a scoping rule
 * that will eventually be written four times.
 *
 * A `center`-scoped caller with no centres resolves to `inArray(..., [])`,
 * which matches nothing — the correct answer for someone assigned to no
 * centre, and the safe direction to fail in.
 */
export function leadScopeWhere(user: SessionUser): SQL | undefined {
  const scope = analystScope(user);
  if (scope === "all") return isNull(leads.deletedAt);
  if (scope === "center") {
    return and(isNull(leads.deletedAt), inArray(leads.centerId, user.centerIds));
  }
  return and(isNull(leads.deletedAt), eq(leads.assignedTo, user.id));
}

/**
 * Narrows a caller-supplied centre filter to what they may actually see.
 *
 * This is the specific hole the CLAUDE.md rule warns about: the model
 * passes a centre name because the user asked for it, and without this the
 * tool would happily answer. Anything outside the caller's own centres is
 * dropped, so an out-of-scope request returns an empty result rather than
 * another centre's numbers. `all` scope passes through unchanged.
 */
export function allowedCenterIds(user: SessionUser, requested: string[] | undefined): string[] | null {
  const scope = analystScope(user);
  if (scope === "all") return requested && requested.length > 0 ? requested : null;
  if (scope === "own") return null; // own-scope tools filter by assignee, not centre
  const permitted = new Set(user.centerIds);
  if (!requested || requested.length === 0) return user.centerIds;
  return requested.filter((id) => permitted.has(id));
}
