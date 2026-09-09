"use server";

import { revalidatePath } from "next/cache";

import { can, getCurrentUser } from "@/lib/auth/session";
import { resolveError } from "@/lib/errors/capture";

export interface HealthState {
  error?: string;
  success?: string;
}

/**
 * Marks a problem fixed.
 *
 * Not a delete: the row stays, and the next time that same fault appears
 * it opens a FRESH row rather than quietly resuming the closed one's
 * count. A bug coming back is news, and the whole point of closing one is
 * to be told if it does.
 */
export async function markResolved(_prev: HealthState, formData: FormData): Promise<HealthState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const id = String(formData.get("errorId") ?? "").trim();
  if (!id) return { error: "Which problem?" };

  await resolveError(id, String(formData.get("note") ?? "").trim() || null);
  revalidatePath("/settings/health");
  return { success: "Marked fixed. You'll be told if it comes back." };
}
