"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { can, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { FINANCE_CENTER_COOKIE, getFinanceCenters } from "./center-filter";

/** Remembers which centre the finance screens show. Empty means the whole company. */
export async function setFinanceCenter(centerId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !can(user, "finance.read")) return;

  const jar = await cookies();
  if (!centerId) {
    jar.delete(FINANCE_CENTER_COOKIE);
  } else {
    const centers = await getFinanceCenters(await createClient());
    if (!centers.some((c) => c.id === centerId)) return;
    jar.set(FINANCE_CENTER_COOKIE, centerId, { path: "/finance", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  revalidatePath("/finance", "layout");
}
