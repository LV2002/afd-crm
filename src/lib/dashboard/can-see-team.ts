import { can, type SessionUser } from "@/lib/auth/session";

/**
 * May this person look in on another person's numbers?
 *
 * `report.center` OR `report.org`. They are independent primitives, so a
 * role an admin has trimmed to org-wide reports only (no centre grant) is
 * still plainly a manager — and was locked out of the counsellor list when
 * this checked `report.center` alone. The sidebar list and the page it opens
 * share this one definition so they appear and disappear together.
 */
export function canSeeTeam(user: SessionUser): boolean {
  return can(user, "report.center") || can(user, "report.org");
}
