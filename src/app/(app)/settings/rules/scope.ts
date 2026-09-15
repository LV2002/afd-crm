import type { SessionUser } from "@/lib/auth/session";
import { scopeFor } from "@/lib/auth/session";

/**
 * Assignment rules are institute-wide by nature — one ordered list that
 * decides where every lead in every centre lands — so `assignment_rules`
 * RLS grants nothing below `auth_scope('rules.manage') = 'all'`.
 *
 * The screen has to agree with that exactly. Gating on `can()` alone would
 * let an admin-created role holding `rules.manage` at centre scope open a
 * page that shows no rules and fails on every save, which reads as a
 * broken product rather than a permission they do not have.
 */
export function manageScope(user: SessionUser): "own" | "center" | "all" | undefined {
  return scopeFor(user, "rules.manage");
}
