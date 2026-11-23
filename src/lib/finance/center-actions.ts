"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { can, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { ALL_CENTERS, FINANCE_CENTER_COOKIE, getFinanceCenters } from "./center-filter";

/**
 * Remembers which centre the finance screens show. Empty means the whole company.
 *
 * "All centres" is stored as a value of its own rather than by deleting the
 * cookie: the cookie lives at path /finance, and a delete that does not name
 * that path expires a cookie at "/" instead, leaving the old centre choice in
 * place — which is how choosing All centres used to snap back to Kannur.
 *
 * It is a session cookie on purpose. Each new visit starts at All centres; a
 * centre is only ever shown because somebody picked it in this sitting.
 */
export async function setFinanceCenter(centerId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !can(user, "finance.read")) return;

  const jar = await cookies();
  if (!centerId) {
    jar.set(FINANCE_CENTER_COOKIE, ALL_CENTERS, { path: "/finance", sameSite: "lax" });
  } else {
    const centers = await getFinanceCenters(await createClient());
    if (!centers.some((c) => c.id === centerId)) return;
    jar.set(FINANCE_CENTER_COOKIE, centerId, { path: "/finance", sameSite: "lax" });
  }
  revalidatePath("/finance", "layout");
}
