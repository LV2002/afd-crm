"use server";

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { onboardingItems } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

export interface OnboardingItemState {
  error?: string;
  success?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function admin() {
  const user = await getCurrentUser();
  return user && can(user, "settings.manage") ? user : null;
}

/** Adds an onboarding item, or renames one. */
export async function saveOnboardingItem(_prev: OnboardingItemState, formData: FormData): Promise<OnboardingItemState> {
  const user = await admin();
  if (!user) return { error: "You don't have permission to do that." };
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { error: "Write what has to be done." };
  if (label.length > 200) return { error: "Keep it under 200 characters." };
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  if (id) {
    if (!UUID.test(id)) return { error: "That item does not exist." };
    await db.update(onboardingItems).set({ label, updatedAt: new Date() }).where(eq(onboardingItems.id, id));
    await writeAuditLog(supabase, { actorId: user.id, action: "onboarding_item.update", entityType: "onboarding_items", entityId: id, after: { label } });
  } else {
    const [{ next }] = await db
      .select({ next: sql<number>`coalesce(max(${onboardingItems.sortOrder}), -1) + 1` })
      .from(onboardingItems)
      .where(isNull(onboardingItems.deletedAt));
    const [row] = await db.insert(onboardingItems).values({ label, sortOrder: Number(next) }).returning({ id: onboardingItems.id });
    await writeAuditLog(supabase, { actorId: user.id, action: "onboarding_item.create", entityType: "onboarding_items", entityId: row.id, after: { label } });
  }
  revalidatePath("/settings/onboarding");
  revalidatePath("/students", "layout");
  return { success: id ? "Saved." : "Added." };
}

/** Switches an item off (or on). Students already onboarded keep their ticks. */
export async function setOnboardingItemActive(id: string, isActive: boolean): Promise<OnboardingItemState> {
  const user = await admin();
  if (!user) return { error: "You don't have permission to do that." };
  if (!UUID.test(id)) return { error: "That item does not exist." };
  await db.update(onboardingItems).set({ isActive, updatedAt: new Date() }).where(eq(onboardingItems.id, id));
  await writeAuditLog(await createClient(), { actorId: user.id, action: "onboarding_item.toggle", entityType: "onboarding_items", entityId: id, after: { isActive } });
  revalidatePath("/settings/onboarding");
  revalidatePath("/students", "layout");
  return {};
}

/** Swaps an item with its neighbour. */
export async function moveOnboardingItem(id: string, direction: "up" | "down"): Promise<OnboardingItemState> {
  const user = await admin();
  if (!user) return { error: "You don't have permission to do that." };
  const rows = await db
    .select({ id: onboardingItems.id, sortOrder: onboardingItems.sortOrder })
    .from(onboardingItems)
    .where(and(isNull(onboardingItems.deletedAt)))
    .orderBy(asc(onboardingItems.sortOrder), asc(onboardingItems.createdAt));
  const index = rows.findIndex((r) => r.id === id);
  const other = rows[direction === "up" ? index - 1 : index + 1];
  if (index < 0 || !other) return {};
  // Renumber the whole list so ties can never leave the order ambiguous.
  const order = rows.map((r) => r.id);
  [order[index], order[order.indexOf(other.id)]] = [other.id, id];
  await db.transaction(async (tx) => {
    for (const [position, itemId] of order.entries()) {
      await tx.update(onboardingItems).set({ sortOrder: position }).where(eq(onboardingItems.id, itemId));
    }
  });
  revalidatePath("/settings/onboarding");
  return {};
}
