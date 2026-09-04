import "server-only";

import { eq } from "drizzle-orm";

import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { discountLimits } from "@/lib/db/schema";

import { NO_AUTHORITY, type DiscountLimit } from "./discount-authority";

/**
 * One person's discount ceiling, from their role.
 *
 * Reads over the direct client because the fee panel needs this for
 * roles that may not otherwise touch the table, and `discount_limits` is
 * world-readable configuration anyway (migration 0050) — the ceiling has
 * to be shown to a counsellor BEFORE they type a number, not after.
 *
 * An absent row is `NO_AUTHORITY`, never unlimited. That is the whole
 * point of the feature: a role nobody has configured cannot give money
 * away, and the seed sets deliberate starting figures for the six shipped
 * roles so day one is not a surprise.
 */
export async function getDiscountLimit(user: SessionUser): Promise<DiscountLimit> {
  const [row] = await db
    .select({
      maxPercent: discountLimits.maxPercent,
      maxAmountPaise: discountLimits.maxAmountPaise,
      isUnlimited: discountLimits.isUnlimited,
    })
    .from(discountLimits)
    .where(eq(discountLimits.roleId, user.roleId));

  if (!row) return NO_AUTHORITY;
  return {
    maxPercent: row.maxPercent,
    maxAmountPaise: row.maxAmountPaise,
    isUnlimited: row.isUnlimited,
  };
}
