"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { discountLimits, roles } from "@/lib/db/schema";
import { limitWithin } from "@/lib/enrolment/discount-authority";
import { getDiscountLimit } from "@/lib/enrolment/get-discount-limit";
import { parseRupeesToPaise } from "@/lib/format/currency";
import { createClient } from "@/lib/supabase/server";

export interface DiscountLimitState {
  error?: string;
  success?: string;
}

/**
 * Sets one role's discount authority.
 *
 * A blank percentage or amount means "this ceiling does not apply to this
 * role", not zero — the two are genuinely different and confusing them
 * would either lock a role out or let it give anything away. The form
 * labels them accordingly and this reads them the same way.
 */
export async function saveDiscountLimit(
  _prev: DiscountLimitState,
  formData: FormData,
): Promise<DiscountLimitState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "discount.manage")) {
    return { error: "You don't have permission to change discount limits." };
  }

  const roleId = formData.get("roleId");
  if (typeof roleId !== "string" || !roleId) return { error: "Missing role." };

  const [role] = await db
    .select({ id: roles.id, code: roles.code, name: roles.name })
    .from(roles)
    .where(eq(roles.id, roleId));
  if (!role) return { error: "That role no longer exists." };

  const isUnlimited = formData.get("isUnlimited") === "on";

  const percentRaw = String(formData.get("maxPercent") ?? "").trim();
  let maxPercent: number | null = null;
  if (percentRaw !== "") {
    const parsed = Number(percentRaw);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
      return { error: "The percentage must be a whole number between 0 and 100." };
    }
    maxPercent = parsed;
  }

  const amountRaw = String(formData.get("maxAmount") ?? "").trim();
  let maxAmountPaise: number | null = null;
  if (amountRaw !== "") {
    const parsed = parseRupeesToPaise(amountRaw);
    if (parsed === null) return { error: "The cash limit must be an amount in rupees." };
    maxAmountPaise = parsed;
  }

  // Both blank and not unlimited would mean "no ceiling at all", which is
  // the one thing this screen must never quietly do — it is exactly what
  // the feature exists to prevent. Say so rather than saving it.
  if (!isUnlimited && maxPercent === null && maxAmountPaise === null) {
    return {
      error:
        "Set a percentage, a cash limit, or tick 'no limit'. Leaving both blank without ticking it would give this role unlimited authority by accident.",
    };
  }

  /*
    Nobody can lift their own ceiling, or set one above it.

    Handing discount authority to a centre head is the point of this
    permission; letting that centre head type "no limit" against their own
    role would make every limit on the screen a suggestion. So unless the
    caller already has unlimited authority themselves (an admin, a co-admin):
    their own role's row is read-only to them, and no role can be given more
    than they hold. Reducing a limit is always allowed.
  */
  const callerUnlimited = user.roleCode === "admin" || (await getDiscountLimit(user)).isUnlimited;
  if (!callerUnlimited) {
    if (roleId === user.roleId) {
      return {
        error:
          "You can't change your own role's discount authority. Ask an admin, or a role with more authority than yours.",
      };
    }
    if (!limitWithin({ maxPercent, maxAmountPaise, isUnlimited }, await getDiscountLimit(user))) {
      return {
        error:
          "That is more than you can give yourself, so you can't give it to another role either. Set a lower limit, or ask an admin.",
      };
    }
  }

  const [before] = await db
    .select({
      maxPercent: discountLimits.maxPercent,
      maxAmountPaise: discountLimits.maxAmountPaise,
      isUnlimited: discountLimits.isUnlimited,
    })
    .from(discountLimits)
    .where(eq(discountLimits.roleId, roleId));

  await db
    .insert(discountLimits)
    .values({ roleId, maxPercent, maxAmountPaise, isUnlimited })
    .onConflictDoUpdate({
      target: discountLimits.roleId,
      set: { maxPercent, maxAmountPaise, isUnlimited, updatedAt: new Date() },
    });

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "discount_limit.update",
    entityType: "discount_limits",
    entityId: roleId,
    before: before ?? null,
    after: { role: role.code, maxPercent, maxAmountPaise, isUnlimited },
  });

  revalidatePath("/settings/discount-limits");
  return { success: `Saved ${role.name}'s discount authority.` };
}
