import type { PermissionCode } from "@/lib/auth/permissions";

/**
 * Which queue badges a person's permissions earn them, and nothing else.
 *
 * Separated from the queries so it can be reasoned about and tested on its
 * own: this table is what stops the sidebar asking the database for a count
 * the caller could not open, and — more importantly — what stops it showing
 * a zero to somebody who simply has no access. A grey "0 unassigned" to a
 * counsellor who cannot assign is worse than no badge: it reads as "nothing
 * to do" rather than "not your screen".
 *
 * Each permission is the one the badge's own screen is gated on, so the
 * badge and the link it sits on always appear and disappear together.
 */
export const NAV_BADGE_KEYS = [
  "followUps",
  "unassigned",
  "admissions",
  "profileForms",
  "whatsapp",
  "onboarding",
] as const;
export type NavBadgeKey = (typeof NAV_BADGE_KEYS)[number];

export const NAV_BADGE_PERMISSION: Record<NavBadgeKey, PermissionCode> = {
  // Everybody who can see a lead can be behind on one, so this is the
  // same permission the screen is gated on. Unlike the unassigned pile
  // it is not an admin's queue — it is each person's own.
  followUps: "lead.read",
  unassigned: "lead.assign",
  admissions: "payment.read",
  // Same permission the screen itself is gated on, so everybody who can see
  // the forms sees the count — which is what "everyone should know a form
  // came in" means in practice.
  profileForms: "lead.read",
  whatsapp: "whatsapp.read",
  onboarding: "student.read",
};

/** A key is absent when the caller cannot see that queue; zero means "empty". */
export type NavBadgeCounts = Partial<Record<NavBadgeKey, number>>;

/** The badges to compute for somebody holding these permissions. */
export function navBadgesFor(has: (code: PermissionCode) => boolean): NavBadgeKey[] {
  return NAV_BADGE_KEYS.filter((key) => has(NAV_BADGE_PERMISSION[key]));
}
