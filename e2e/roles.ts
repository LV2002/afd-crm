import { assertSafeTarget } from "./guard";

/**
 * The six seeded logins, and where their saved cookies live.
 *
 * Testing per role is the point rather than a thoroughness exercise. Almost
 * every bug this suite can find is a permission bug: a screen that renders
 * for an admin and throws for a counsellor, a button that appears to
 * somebody who cannot use it, a list that quietly shows another centre's
 * leads. One admin walkthrough would find none of them.
 */
export const SEED_PASSWORD = "AfdCrm2026!";

export interface Role {
  key: string;
  email: string;
  /** What this person is, for a test name that reads as a sentence. */
  describes: string;
}

export const ROLES: Role[] = [
  { key: "admin", email: "admin@afd-crm.test", describes: "an administrator" },
  { key: "co_admin", email: "coadmin@afd-crm.test", describes: "a co-admin" },
  { key: "center_head", email: "centerhead.kochi@afd-crm.test", describes: "a Kochi centre head" },
  { key: "counsellor", email: "counsellor.kochi@afd-crm.test", describes: "a Kochi counsellor" },
  { key: "accounts", email: "accounts@afd-crm.test", describes: "somebody in accounts" },
  { key: "academics", email: "academics@afd-crm.test", describes: "somebody in academics" },
];

export function storageStateFor(roleKey: string): string {
  return `e2e/.auth/${roleKey}.json`;
}

export function roleByKey(key: string): Role {
  const role = ROLES.find((candidate) => candidate.key === key);
  if (!role) throw new Error(`No seeded role "${key}"`);
  return role;
}

/** Called from every spec file, so no entry point can skip the seatbelt. */
assertSafeTarget();
