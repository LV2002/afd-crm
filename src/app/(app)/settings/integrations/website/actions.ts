"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { hasIntegrationCredential, setIntegrationCredential } from "@/lib/integrations/credentials";
import { createClient } from "@/lib/supabase/server";

export interface WebsiteFormState {
  error?: string;
  /** Shown once, immediately after generating. Never readable again. */
  secret?: string;
  success?: string;
}

export async function getWebsiteStatus(): Promise<{ configured: boolean }> {
  return { configured: await hasIntegrationCredential("website", "signing_secret") };
}

/**
 * Generates the shared secret the website's Apps Script signs with.
 *
 * Generated here rather than typed in, for two reasons. A secret somebody
 * invents is a secret somebody can guess, and this one is the only thing
 * standing between the lead pipeline and anybody who finds the webhook
 * URL. And it is shown exactly once: it is stored encrypted, and there is
 * no screen anywhere that reads a credential back — so if it is lost, the
 * answer is to generate a new one and update the script, never to look it
 * up.
 */
export async function generateWebsiteSecret(): Promise<WebsiteFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const secret = randomBytes(32).toString("base64url");
  await setIntegrationCredential("website", "signing_secret", secret);

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "integration.credentials_update",
    entityType: "integration_credentials",
    // The secret itself is never written here. Nothing in this system
    // ever puts a credential in the audit log.
    after: { provider: "website", key: "signing_secret", rotated: true },
  });

  revalidatePath("/settings/integrations/website");
  return {
    secret,
    success: "Copy this now — it cannot be shown again.",
  };
}

export interface OutcomesFormState {
  error?: string;
  success?: string;
}

/**
 * Saves where outcomes are reported (the Apps Script's `/exec` address) and
 * the key they are signed with. Both go into the encrypted credential
 * store; neither is ever read back to the browser or written to the audit
 * log. Leaving the key blank keeps the one already saved, so the address
 * can be corrected without retyping it.
 */
export async function saveOutcomesSettings(
  _prev: OutcomesFormState,
  formData: FormData,
): Promise<OutcomesFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const execUrl = String(formData.get("execUrl") ?? "").trim();
  const secret = String(formData.get("secret") ?? "").trim();

  if (execUrl) {
    let parsed: URL;
    try {
      parsed = new URL(execUrl);
    } catch {
      return { error: "That address isn't a web address. Paste the whole link, ending in /exec." };
    }
    if (parsed.protocol !== "https:" || !parsed.pathname.endsWith("/exec")) {
      return { error: "The address must start with https:// and end in /exec." };
    }
    await setIntegrationCredential("website", "outcomes_exec_url", parsed.toString());
  }
  if (secret) {
    if (secret.length < 12) return { error: "The key is too short — paste the whole phrase." };
    await setIntegrationCredential("website", "outcomes_secret", secret);
  }
  if (!execUrl && !secret) return { error: "Paste the address, the key, or both." };

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "integration.credentials_update",
    entityType: "integration_credentials",
    after: {
      provider: "website",
      keys: [execUrl && "outcomes_exec_url", secret && "outcomes_secret"].filter(Boolean),
    },
  });

  revalidatePath("/settings/integrations/website");
  return { success: "Saved. Status changes are reported within about ten minutes." };
}
