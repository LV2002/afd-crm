"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { whatsappNumbers } from "@/lib/db/schema";
import { getIntegrationCredential, getIntegrationCredentials } from "@/lib/integrations/credentials";
import { MetaGraphApiError } from "@/lib/integrations/meta/graph-client";
import { listWabaPhoneNumbers, subscribeAppToWaba, wabaIdsForToken } from "@/lib/integrations/whatsapp/client";
import { createClient } from "@/lib/supabase/server";
import { pickNewNumber } from "@/lib/whatsapp/pick-new-number";
import { insertOrReviveNumber } from "@/lib/whatsapp/register-number";

export interface FoundNumber {
  id: string;
  wabaId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
}

export interface FindNumbersState {
  error?: string;
  success?: string;
  numbers?: FoundNumber[];
}

/**
 * Asks the connected WhatsApp account which numbers it has that this CRM does
 * not know yet. Uses the saved access token and account ID, so it needs no
 * help from Meta's connection window: that window connects the number inside
 * Meta whether or not the CRM's last step worked. The institute's own API
 * number and every number already registered here are left out.
 */
export async function findUnregisteredNumbers(extraAccountId?: string): Promise<FindNumbersState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return { error: "You don't have permission to do that." };

  const { access_token: accessToken, waba_id: wabaId, phone_number_id: apiNumberId } = await getIntegrationCredentials("whatsapp", [
    "access_token",
    "waba_id",
    "phone_number_id",
  ]);
  if (!accessToken || !wabaId) {
    return { error: "Connect the API number first (its access token and Business Account ID are used to look the account up)." };
  }

  // The saved account first, then every other WhatsApp account the token can
  // see: a counsellor's number is often on a different account from the API one.
  const accountIds = [wabaId];
  const typed = (extraAccountId ?? "").trim();
  if (typed) {
    if (!/^\d+$/.test(typed)) return { error: "The WhatsApp account ID is digits only." };
    if (!accountIds.includes(typed)) accountIds.push(typed);
  }
  const appId = await getIntegrationCredential("whatsapp", "app_id");
  const appSecret = await getIntegrationCredential("whatsapp", "app_secret");
  if (appId && appSecret) {
    try {
      for (const id of await wabaIdsForToken(appId, appSecret, accessToken)) if (!accountIds.includes(id)) accountIds.push(id);
    } catch {
      // Fall back to the saved account alone.
    }
  }

  const onAccount: Array<Awaited<ReturnType<typeof listWabaPhoneNumbers>>[number] & { wabaId: string }> = [];
  let firstError: string | null = null;
  const failedIds = new Set<string>();
  for (const id of accountIds) {
    try {
      for (const n of await listWabaPhoneNumbers(id, accessToken)) onAccount.push({ ...n, wabaId: id });
    } catch (error) {
      failedIds.add(id);
      firstError ??= error instanceof MetaGraphApiError ? `Meta would not list the account's numbers: ${error.message}` : "Could not reach Meta.";
    }
  }
  if (onAccount.length === 0 && firstError) return { error: firstError };
  if (typed && failedIds.has(typed)) return { error: `Meta would not show account ${typed} to the saved access token. Generate a new token for the CRM's system user (it must be created after the account was added to it) and save it in the API number's details, then look again.${firstError ? ` Meta said: ${firstError}` : ""}` };

  const registered = await db
    .select({ id: whatsappNumbers.phoneNumberId })
    .from(whatsappNumbers)
    .where(isNull(whatsappNumbers.deletedAt));
  const { candidates } = pickNewNumber(onAccount, [...registered.map((r) => r.id), apiNumberId]);

  if (candidates.length === 0) {
    return {
      numbers: [],
      error:
        `Looked at ${accountIds.length} WhatsApp account${accountIds.length === 1 ? "" : "s"} and found no number the CRM doesn't already know. If the counsellor's number is on another account, give the CRM's Meta system user access to that account (Business settings → System users → Add assets → WhatsApp accounts), then look again.`,
    };
  }
  return {
    numbers: candidates.map((c) => ({ id: c.id, wabaId: c.wabaId, displayPhoneNumber: c.displayPhoneNumber, verifiedName: c.verifiedName })),
  };
}

const registerSchema = z.object({
  phoneNumberId: z.string().trim().regex(/^\d+$/),
  wabaId: z.string().trim().regex(/^\d+$/).optional(),
  displayPhoneNumber: z.string().trim().max(40).nullable(),
  label: z.string().trim().min(1, "Give the number a label you will recognise.").max(120),
  counsellorId: z.string().uuid("Choose whose phone this is."),
});

/** Registers one of the numbers `findUnregisteredNumbers` listed, as a Coexistence number owned by a counsellor. */
export async function registerFoundNumber(input: z.input<typeof registerSchema>): Promise<FindNumbersState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return { error: "You don't have permission to do that." };

  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details and try again." };
  const { phoneNumberId, wabaId: foundWabaId, displayPhoneNumber, label, counsellorId } = parsed.data;

  const [clash] = await db
    .select({ label: whatsappNumbers.label })
    .from(whatsappNumbers)
    .where(and(isNull(whatsappNumbers.deletedAt), eq(whatsappNumbers.phoneNumberId, phoneNumberId)));
  if (clash) return { error: `That number is already registered here as "${clash.label}".` };

  const created = await insertOrReviveNumber({
    phoneNumberId,
    label,
    displayPhoneNumber,
    mode: "coexistence",
    counsellorId,
    createsLeads: true,
  });

  // Best effort: make sure the app is subscribed to the account so this
  // number's messages are delivered. A failure here is not fatal — the
  // number is registered — and is said plainly.
  let note = "";
  const { access_token: accessToken, waba_id: savedWabaId } = await getIntegrationCredentials("whatsapp", ["access_token", "waba_id"]);
  const subscribeTo = foundWabaId ?? savedWabaId;
  if (accessToken && subscribeTo) {
    try {
      await subscribeAppToWaba(subscribeTo, accessToken);
    } catch {
      note = " The CRM could not subscribe the app to the account, so run the check below and use Tick the missing webhook fields if messages don't arrive.";
    }
  }

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "whatsapp_number.registered_from_account",
    entityType: "whatsapp_numbers",
    entityId: created.id,
    after: { phoneNumberId, label, counsellorId, mode: "coexistence" },
  });

  revalidatePath("/settings/integrations/whatsapp");
  return { success: `${label} is registered.${note} Send a message to it from another phone and run the check.` };
}
