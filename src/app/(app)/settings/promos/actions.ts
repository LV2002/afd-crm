"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { promos } from "@/lib/db/schema";
import { validatePromo, type PromoDiscountType } from "@/lib/enrolment/promos";
import { createClient } from "@/lib/supabase/server";

export interface PromoFormState {
  error?: string;
  success?: string;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function readDate(formData: FormData, key: string): string | null {
  const raw = String(formData.get(key) ?? "").trim();
  return DATE_ONLY.test(raw) ? raw : null;
}

/** Rupees on screen, paise in the database — the only conversion point, as everywhere else. */
function rupeesToPaise(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed.replace(/,/g, ""));
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

function readList(formData: FormData, key: string): string[] {
  return String(formData.get(key) ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Creates or edits an offer.
 *
 * `settings.manage` only, the same gate as fee structures: what the
 * institute charges and what it is prepared to knock off are the same
 * decision, and neither belongs to whoever happens to be closing a sale.
 */
export async function savePromo(
  _prev: PromoFormState,
  formData: FormData,
): Promise<PromoFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to manage offers." };
  }

  const promoId = String(formData.get("promoId") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim() || null;
  const rawType = String(formData.get("discountType") ?? "");
  const discountType: PromoDiscountType = rawType === "fixed" ? "fixed" : "percentage";

  const percentRaw = String(formData.get("percentValue") ?? "").trim();
  const percentValue =
    discountType === "percentage" && percentRaw !== "" ? Number(percentRaw) : null;
  const fixedPaise =
    discountType === "fixed" ? rupeesToPaise(String(formData.get("fixedAmount") ?? "")) : null;
  const maxDiscountPaise =
    discountType === "percentage" ? rupeesToPaise(String(formData.get("maxDiscount") ?? "")) : null;

  const maxUsesRaw = String(formData.get("maxUses") ?? "").trim();
  const maxUses = maxUsesRaw === "" ? null : Number(maxUsesRaw);
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) {
    return { error: "A usage limit has to be a whole number of one or more." };
  }

  const values = {
    name,
    code,
    discountType,
    percentValue: percentValue === null ? null : String(percentValue),
    fixedPaise,
    maxDiscountPaise,
    validFrom: readDate(formData, "validFrom"),
    validUntil: readDate(formData, "validUntil"),
    courses: readList(formData, "courses"),
    centerIds: readList(formData, "centerIds"),
    maxUses,
    isActive: formData.get("isActive") !== "off",
  };

  // The same checks the fee panel would hit later, applied now — a promo
  // with no value is a discount of nothing that looks like a discount.
  const problems = validatePromo({
    name,
    discountType,
    percentValue,
    fixedPaise,
    maxDiscountPaise,
    validFrom: values.validFrom,
    validUntil: values.validUntil,
    maxUses,
  });
  if (problems.length > 0) return { error: problems[0] };

  let savedId: string;
  if (promoId) {
    await db
      .update(promos)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(promos.id, promoId), isNull(promos.deletedAt)));
    savedId = promoId;
  } else {
    const [created] = await db
      .insert(promos)
      .values({ ...values, createdBy: user.id })
      .returning({ id: promos.id });
    savedId = created.id;
  }

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: promoId ? "promo.update" : "promo.create",
    entityType: "promos",
    entityId: savedId,
    after: values,
  });

  revalidatePath("/settings/promos");
  return { success: promoId ? "Saved." : `Created ${name}.` };
}

/**
 * Retires an offer.
 *
 * Soft, like everything consequential here (CLAUDE.md § 5). Admissions
 * that took this offer keep pointing at it, and "what was Early Bird
 * actually worth?" stays answerable after the offer is long over.
 */
export async function deletePromo(
  _prev: PromoFormState,
  formData: FormData,
): Promise<PromoFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to manage offers." };
  }

  const promoId = String(formData.get("promoId") ?? "").trim();
  if (!promoId) return { error: "Which offer?" };

  await db
    .update(promos)
    .set({ deletedAt: new Date(), isActive: false })
    .where(and(eq(promos.id, promoId), isNull(promos.deletedAt)));

  revalidatePath("/settings/promos");
  return { success: "Retired. Admissions that used it keep their discount." };
}
