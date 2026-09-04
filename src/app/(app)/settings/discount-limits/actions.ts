"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { discountLimits, roles } from "@/lib/db/schema";
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
  if (!user || !can(user, "settings.manage")) {
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
