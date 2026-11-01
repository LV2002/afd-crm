import { and, eq, isNull } from "drizzle-orm";

import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { financeAccounts } from "@/lib/db/schema";

/**
 * Finance writes run on the direct database connection, which bypasses RLS
 * (a transfer is two rows that must commit together). So the check RLS would
 * have made is made here instead, before anything is written.
 */

/** The centre an account belongs to, plus whether this caller may touch it. */
export async function assertAccountInScope(
  accountId: string,
  permission: "finance.record" | "finance.manage",
): Promise<{ ok: true; centerId: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user || !can(user, permission)) {
    return { ok: false, error: "You don't have permission to do that." };
  }

  const [account] = await db
    .select({ centerId: financeAccounts.centerId, isActive: financeAccounts.isActive })
    .from(financeAccounts)
    .where(and(eq(financeAccounts.id, accountId), isNull(financeAccounts.deletedAt)));
  if (!account) return { ok: false, error: "That account no longer exists." };

  const scope = scopeFor(user, permission);
  // `own` cannot match: money has no owner the way a lead does, so a role
  // granted finance at own scope reaches nothing — which is the safe
  // reading of a configuration that does not make sense.
  if (scope !== "all" && !user.centerIds.includes(account.centerId)) {
    return { ok: false, error: "That account is outside your centre." };
  }
  return { ok: true, centerId: account.centerId };
}

