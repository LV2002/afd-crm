"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { financeAlertRules, type FinanceAlertMetric } from "@/lib/db/schema";
import { rupeesToPaise } from "@/lib/enrolment/instalment-plan";
import { createClient } from "@/lib/supabase/server";

export interface AlertRuleState {
  error?: string;
  success?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Adds a mark to watch, or changes one. */
export async function saveAlertRule(_prev: AlertRuleState, formData: FormData): Promise<AlertRuleState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return { error: "You don't have permission to do that." };

  const metric = String(formData.get("metric") ?? "");
  if (metric !== "bank_balance" && metric !== "income_fy") return { error: "Pick what to watch." };
  const limitPaise = rupeesToPaise(String(formData.get("limit") ?? ""));
  if (limitPaise === null || limitPaise <= 0) return { error: "Enter the mark in rupees, e.g. 2000000 for 20 lakh." };
  const warnPercent = Number(formData.get("warnPercent") ?? 90);
  if (!Number.isInteger(warnPercent) || warnPercent < 50 || warnPercent > 99) return { error: "Warn at a percentage between 50 and 99." };
  const label = String(formData.get("label") ?? "").trim() || `₹${(limitPaise / 100).toLocaleString("en-IN")}`;

  const id = String(formData.get("id") ?? "");
  const values = { label, metric: metric as FinanceAlertMetric, limitPaise, warnPercent };
  const supabase = await createClient();
  if (id) {
    if (!UUID.test(id)) return { error: "That rule does not exist." };
    await db.update(financeAlertRules).set({ ...values, updatedAt: new Date() }).where(eq(financeAlertRules.id, id));
    await writeAuditLog(supabase, { actorId: user.id, action: "finance_alert.update", entityType: "finance_alert_rules", entityId: id, after: values });
  } else {
    const [row] = await db.insert(financeAlertRules).values(values).returning({ id: financeAlertRules.id });
    await writeAuditLog(supabase, { actorId: user.id, action: "finance_alert.create", entityType: "finance_alert_rules", entityId: row.id, after: values });
  }
  revalidatePath("/settings/finance-alerts");
  return { success: id ? "Saved." : "Added." };
}

export async function setAlertRuleActive(id: string, isActive: boolean): Promise<AlertRuleState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return { error: "You don't have permission to do that." };
  if (!UUID.test(id)) return { error: "That rule does not exist." };
  await db.update(financeAlertRules).set({ isActive, updatedAt: new Date() }).where(eq(financeAlertRules.id, id));
  await writeAuditLog(await createClient(), { actorId: user.id, action: "finance_alert.toggle", entityType: "finance_alert_rules", entityId: id, after: { isActive } });
  revalidatePath("/settings/finance-alerts");
  return {};
}
