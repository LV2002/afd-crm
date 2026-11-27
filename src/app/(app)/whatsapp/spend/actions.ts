"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { whatsappRates } from "@/lib/db/schema";
import { BILLING_CATEGORIES, formatRate, parseRate } from "@/lib/whatsapp/pricing";
import { createClient } from "@/lib/supabase/server";

export interface RatesState {
  error?: string;
  success?: string;
}

/** Edits what each category costs per message. Needs settings.manage: it changes every estimate. */
export async function saveRates(_prev: RatesState, formData: FormData): Promise<RatesState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return { error: "You don't have permission to do that." };

  const next: Array<{ category: string; rate: number }> = [];
  for (const category of BILLING_CATEGORIES) {
    const raw = String(formData.get(category) ?? "");
    const rate = parseRate(raw);
    if (rate === null) return { error: `"${raw}" is not a rate. Use rupees per message, like 0.8631.` };
    next.push({ category, rate });
  }

  for (const { category, rate } of next) {
    await db
      .insert(whatsappRates)
      .values({ category, rateTenThousandths: rate, updatedBy: user.id })
      .onConflictDoUpdate({
        target: whatsappRates.category,
        set: { rateTenThousandths: rate, updatedAt: new Date(), updatedBy: user.id },
      });
  }

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "whatsapp.rates_update",
    entityType: "whatsapp_rates",
    after: Object.fromEntries(next.map((n) => [n.category, formatRate(n.rate)])),
  });
  revalidatePath("/whatsapp/spend");
  return { success: "Rates saved. New estimates use them straight away." };
}
