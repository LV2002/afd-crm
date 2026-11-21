"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { setIntegrationCredential } from "@/lib/integrations/credentials";
import { createClient } from "@/lib/supabase/server";

export interface RazorpayFormState {
  error?: string;
  success?: string;
}

const KEYS = ["key_id", "key_secret", "webhook_secret"] as const;

/** A blank field leaves what is stored alone, so rotating one key does not mean retyping the others. The values are never echoed back. */
export async function saveRazorpayCredentials(_prev: RazorpayFormState, formData: FormData): Promise<RazorpayFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return { error: "You don't have permission to do that." };

  const saved: string[] = [];
  for (const key of KEYS) {
    const value = String(formData.get(key) ?? "").trim();
    if (!value) continue;
    if (key === "key_id" && !/^rzp_(test|live)_\w+$/.test(value)) return { error: "The Key ID starts with rzp_test_ or rzp_live_." };
    await setIntegrationCredential("razorpay", key, value);
    saved.push(key);
  }
  if (saved.length === 0) return { error: "Nothing to save." };

  const supabase = await createClient();
  await writeAuditLog(supabase, { actorId: user.id, action: "integration.razorpay_credentials_update", entityType: "integration_credentials", entityId: null, after: { keys: saved } });
  revalidatePath("/settings/integrations/razorpay");
  return { success: `Saved ${saved.length} value${saved.length === 1 ? "" : "s"}.` };
}
