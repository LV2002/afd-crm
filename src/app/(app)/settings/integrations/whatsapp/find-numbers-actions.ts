"use server";

import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { whatsappNumbers } from "@/lib/db/schema";
import { getIntegrationCredential, getIntegrationCredentials } from "@/lib/integrations/credentials";
import { MetaGraphApiError } from "@/lib/integrations/meta/graph-client";
import { fetchGraphFacts, fetchWabaSubscribedApps, fetchWabaSubscriptionDetail, listWabaPhoneNumbers, subscribeAppToWaba, wabaIdsForToken } from "@/lib/integrations/whatsapp/client";
import { createClient } from "@/lib/supabase/server";
import { describeNumberFacts, pointsAtThisApp, type FactLine } from "@/lib/whatsapp/number-facts";
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
  /** What Meta said about the counsellor numbers, line by line. */
  facts?: FactLine[];
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
    createsLeads: false,
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

/**
 * Makes sure this app receives the messages of one WhatsApp account, and says
 * what Meta answered.
 *
 * Meta delivers a number's messages to the app only while the app is
 * subscribed to that number's *account*. Registering a number in the CRM does
 * not do that by itself, and when it silently fails the number looks perfectly
 * set up while nothing arrives. This subscribes, then asks Meta whether the
 * subscription is really there, and lists the numbers it can see on the
 * account, so a wrong account ID or a token without access shows up as a
 * plain sentence instead of as silence.
 */
export async function connectAccountMessages(accountId: string): Promise<FindNumbersState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return { error: "You don't have permission to do that." };

  const id = accountId.trim();
  if (!/^\d+$/.test(id)) return { error: "Type the WhatsApp account ID, digits only. You find it in WhatsApp Manager, in the account menu at the top right." };

  const { access_token: accessToken, app_id: appId } = await getIntegrationCredentials("whatsapp", ["access_token", "app_id"]);
  if (!accessToken || !appId) return { error: "Save the access token and App ID first (under the API number's details)." };

  let visible: string;
  try {
    const numbers = await listWabaPhoneNumbers(id, accessToken);
    visible = numbers.length
      ? `Numbers Meta shows on this account: ${numbers.map((n) => n.displayPhoneNumber ?? n.id).join(", ")}.`
      : "Meta shows no numbers on this account.";
  } catch (error) {
    return {
      error:
        error instanceof MetaGraphApiError
          ? `The saved access token cannot see account ${id}. Meta said: ${error.message}. Give the CRM's system user access to this account in Meta Business settings, generate a new token, save it, and try again.`
          : "Could not reach Meta.",
    };
  }

  try {
    await subscribeAppToWaba(id, accessToken);
    const apps = await fetchWabaSubscribedApps(id, accessToken);
    if (!apps.includes(appId)) {
      return { error: `Meta accepted the request but still does not list this app on account ${id}. ${visible}` };
    }
  } catch (error) {
    return { error: error instanceof MetaGraphApiError ? `Meta refused: ${error.message}. ${visible}` : "Could not reach Meta." };
  }

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "whatsapp.account_subscribed",
    entityType: "integration_credentials",
    after: { accountId: id },
  });
  return {
    success: `This app now receives messages for account ${id} (Meta confirms it). ${visible} Send a message to the counsellor's number from another phone and look under Chats.`,
  };
}

const NUMBER_FIELDS = [
  "display_phone_number",
  "status",
  "platform_type",
  "is_on_biz_app",
  "account_mode",
  "code_verification_status",
  "quality_rating",
  "webhook_configuration",
];

/**
 * Asks Meta, number by number, what state each registered Coexistence number
 * is really in, and whether anything redirects its messages away from the CRM.
 * Read-only: it changes nothing.
 */
export async function askMetaAboutCounsellorNumbers(accountId?: string): Promise<FindNumbersState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return { error: "You don't have permission to do that." };

  const { access_token: accessToken } = await getIntegrationCredentials("whatsapp", ["access_token"]);
  if (!accessToken) return { error: "Save the access token first (under the API number's details)." };

  const numbers = await db
    .select({ phoneNumberId: whatsappNumbers.phoneNumberId, label: whatsappNumbers.label })
    .from(whatsappNumbers)
    .where(and(eq(whatsappNumbers.mode, "coexistence"), isNull(whatsappNumbers.deletedAt)));
  if (numbers.length === 0) return { error: "No counsellor (Coexistence) number is registered here yet." };

  const host = (await headers()).get("host");
  const expected = host ? `https://${host}/api/webhooks/whatsapp` : null;
  const facts: FactLine[] = [];
  for (const n of numbers) {
    facts.push({ verdict: "info", text: `${n.label} (number ID ${n.phoneNumberId})` });
    facts.push(...describeNumberFacts(n.label, await fetchGraphFacts(n.phoneNumberId, accessToken, NUMBER_FIELDS), expected));
  }

  const waba = accountId?.trim();
  if (waba && /^\d+$/.test(waba)) {
    facts.push({ verdict: "info", text: `WhatsApp account ${waba}` });
    try {
      const subs = await fetchWabaSubscriptionDetail(waba, accessToken);
      if (subs.length === 0) facts.push({ verdict: "bad", text: "No app is subscribed to this account, so Meta delivers nothing from it to anyone." });
      for (const sub of subs) {
        facts.push(
          sub.overrideCallbackUri && !pointsAtThisApp(sub.overrideCallbackUri, expected)
            ? { verdict: "bad", text: `App ${sub.appId ?? "?"} is subscribed, but this account sends its messages to ${sub.overrideCallbackUri} instead of the CRM.` }
            : { verdict: "good", text: `App ${sub.appId ?? "?"} is subscribed to this account${sub.overrideCallbackUri ? " (with the CRM's own address)" : ", with no override"}.` },
        );
      }
    } catch (error) {
      facts.push({ verdict: "bad", text: error instanceof MetaGraphApiError ? `Meta would not show this account's subscriptions: ${error.message}` : "Could not reach Meta." });
    }
  }
  return { facts };
}
