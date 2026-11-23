"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { whatsappNumbers } from "@/lib/db/schema";
import { reportActionFailure } from "@/lib/errors/action-failure";
import {
  getIntegrationCredential,
  getIntegrationCredentials,
  setIntegrationCredential,
} from "@/lib/integrations/credentials";
import { MetaGraphApiError } from "@/lib/integrations/meta/graph-client";
import {
  exchangeSignupCodeWithFallbacks,
  isAppDomainError,
  RedirectExchangeError,
  getPhoneNumberInfo,
  listWabaPhoneNumbers,
  wabaIdsForToken,
  subscribeAppToWaba,
} from "@/lib/integrations/whatsapp/client";
import { createClient } from "@/lib/supabase/server";
import { pickNewNumber, type AccountNumber } from "@/lib/whatsapp/pick-new-number";
import { credentialsToSave } from "@/lib/whatsapp/signup-credentials";
import { insertOrReviveNumber } from "@/lib/whatsapp/register-number";

/**
 * Finishing what the Embedded Signup popup started.
 *
 * The browser half can only get as far as an authorisation code and two
 * ids. Everything that matters happens here, in one action, because the
 * code is single-use and short-lived: if this is split across two
 * round-trips and the second fails, the counsellor has to run the whole
 * dialog again.
 *
 * In order:
 *
 * 1. **Exchange the code** for a business integration token, using the
 *    app secret. That token outlives the browser session, which is the
 *    entire reason the flow asks for a code rather than letting the SDK
 *    hand back a client token.
 * 2. **Subscribe the app to the account's webhooks.** Embedded Signup
 *    does not do this, and without it the number connects and nothing is
 *    ever delivered — no error anywhere. It is the single most common way
 *    a WhatsApp setup looks broken for a week, and it is one API call, so
 *    it happens here rather than as a step in a document somebody skips.
 * 3. **Save the credentials**, so the CRM can send on the number.
 * 4. **Register the number**, with its owner and its Coexistence
 *    settings, so inbound messages are attributed and the counsellor's
 *    own sends mirror.
 *
 * If step 2 fails the first step has still happened and is kept — a token
 * in hand with no subscription is recoverable by pressing **Subscribe**;
 * throwing the token away because a later call failed would mean running
 * the dialog again for nothing.
 */

export interface EmbeddedSignupState {
  error?: string;
  success?: string;
  /** Said separately from `error` because it is not a failure, just a stop. */
  cancelled?: string;
}

const schema = z.object({
  code: z.string().trim().min(1, "Meta did not return an authorisation code."),
  // Optional: Meta's finish message sometimes never arrives. The code alone is
  // enough, because the token it becomes names the account it was granted.
  wabaId: z.string().trim().regex(/^\d+$/, "Meta returned an account id that is not a number.").optional(),
  // Optional: Meta's Coexistence finish can name the account without the number.
  phoneNumberId: z
    .string()
    .trim()
    .regex(/^\d+$/, "Meta returned a phone number id that is not a number.")
    .optional(),
  label: z.string().trim().min(1, "Give the number a label you will recognise.").max(120),
  counsellorId: z.string().uuid("Choose whose phone this is."),
  // The address of the page that opened Meta's window (and its origin). Meta
  // ties the code to one of these; the exchange tries them if the plain forms fail.
  pageAddresses: z.array(z.string().url().max(300).startsWith("https://")).max(4).optional(),
});

export async function completeEmbeddedSignup(
  input: z.input<typeof schema>,
): Promise<EmbeddedSignupState> {
  try {
    return await run(input);
  } catch (error) {
    return {
      error: await reportActionFailure("action:completeEmbeddedSignup", error, {
        fallback: "Could not finish connecting the number.",
        // An admin-only settings screen, where the failure is nearly
        // always a setup problem the reader is the right person to fix.
        revealMessage: true,
      }),
    };
  }
}

async function run(input: z.input<typeof schema>): Promise<EmbeddedSignupState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Meta returned something unexpected." };
  }
  const { code, label, counsellorId, pageAddresses } = parsed.data;
  let wabaId = parsed.data.wabaId;
  let phoneNumberId = parsed.data.phoneNumberId;

  const appId = await getIntegrationCredential("whatsapp", "app_id");
  const appSecret = await getIntegrationCredential("whatsapp", "app_secret");
  if (!appId || !appSecret) {
    return {
      error: "Save the App ID and App Secret above before connecting a number — the code Meta returns is exchanged with them.",
    };
  }

  // Registered already? Say so before spending the single-use code, so
  // the person is not told to run the dialog again over a duplicate.
  if (phoneNumberId) {
    const [clash] = await db
      .select({ label: whatsappNumbers.label })
      .from(whatsappNumbers)
      .where(and(eq(whatsappNumbers.phoneNumberId, phoneNumberId), isNull(whatsappNumbers.deletedAt)));
    if (clash) {
      return { error: `That number is already registered here as "${clash.label}".` };
    }
  }

  let accessToken: string;
  let redirectForm = "none";
  try {
    ({ accessToken, redirectForm } = await exchangeSignupCodeWithFallbacks(appId, appSecret, code, pageAddresses ?? []));
  } catch (error) {
    if (error instanceof RedirectExchangeError) {
      const host = pageAddresses?.[0] ? new URL(pageAddresses[0]).host : "this site's domain";
      const domainRefused = isAppDomainError(error.last);
      return {
        error:
          `Meta refused the code every way the CRM tried it. What Meta said, in order: ${error.outcomes.join("; ")}. ` +
          (domainRefused
            ? `Code 191 means ${host} is not listed as one of the app's domains: in the Meta app go to App settings → Basic, add ${host} under App Domains (no https://, no slash), save, and connect again. `
            : "Code 36008 means the address the popup used did not match any form the CRM tried. ") +
          "Send this whole message to whoever is helping you.",
      };
    }
    if (error instanceof MetaGraphApiError) {
      return {
        error: `Meta would not exchange the code: ${error.message}. The code expires quickly — run the connection again.`,
      };
    }
    throw error;
  }

  // Meta's finish message may be missing entirely, or may name the account
  // but not the number. Work out whatever is missing from the account itself:
  // which accounts the token was granted, then which numbers they hold that
  // the CRM does not already know. Exactly one is the answer; never a guess.
  if (!wabaId || !phoneNumberId) {
    let accounts: string[];
    try {
      accounts = wabaId ? [wabaId] : await wabaIdsForToken(appId, appSecret, accessToken);
    } catch (error) {
      return {
        error:
          error instanceof MetaGraphApiError
            ? `Meta gave a code but would not say which account it connected: ${error.message}`
            : "Meta gave a code but which account it connected could not be read.",
      };
    }
    if (accounts.length === 0) {
      return { error: "Meta gave a code but the connection includes no WhatsApp account. In Meta's app, check that the Embedded Signup configuration includes WhatsApp accounts and the WhatsApp permissions." };
    }

    const found: AccountNumber[] = [];
    for (const account of accounts) {
      try {
        for (const n of await listWabaPhoneNumbers(account, accessToken)) found.push({ ...n, wabaId: account });
      } catch {
        // One unreadable account must not hide the others.
      }
    }
    const registered = await db
      .select({ id: whatsappNumbers.phoneNumberId })
      .from(whatsappNumbers)
      .where(isNull(whatsappNumbers.deletedAt));
    const apiId = await getIntegrationCredential("whatsapp", "phone_number_id");
    const { chosen, candidates } = pickNewNumber(found, [...registered.map((r) => r.id), apiId]);
    if (!chosen) {
      return {
        error:
          candidates.length === 0
            ? "Meta connected the account, but it has no phone number the CRM does not already know. If the number was added in Meta, wait a minute and try again, or add it with its Phone Number ID in the form below."
            : `Meta connected the account, but it has several unregistered numbers (${candidates.map((c) => `${c.displayPhoneNumber ?? "?"} (ID ${c.id})`).join(", ")}). Add the right one with its Phone Number ID in the form below.`,
      };
    }
    phoneNumberId = chosen.id;
    wabaId = chosen.wabaId ?? wabaId;
  }
  if (!wabaId || !phoneNumberId) return { error: "Could not work out which number was connected." };

  // Leave the institute's saved credentials alone: they belong to the API
  // number every broadcast sends from. Only a missing value is filled in.
  const existing = await getIntegrationCredentials("whatsapp", ["access_token", "waba_id", "phone_number_id"]);
  const { toSave, keptExisting } = credentialsToSave(existing, {
    access_token: accessToken,
    waba_id: wabaId,
    phone_number_id: phoneNumberId,
  });
  for (const [key, value] of Object.entries(toSave)) {
    await setIntegrationCredential("whatsapp", key, value);
  }
  // Subscribe with the token Meta just issued for this signup, which is
  // certain to be allowed on this account, whichever token is saved.
  let subscriptionNote = "";
  try {
    await subscribeAppToWaba(wabaId, accessToken);
  } catch (error) {
    // Kept, not unwound. The token is real and was expensive to get.
    subscriptionNote =
      " The number is connected, but subscribing it to webhooks failed, so nothing will arrive yet — press Subscribe, or check that the app has the WhatsApp permissions.";
    if (error instanceof MetaGraphApiError) {
      subscriptionNote = ` The number is connected, but Meta refused the webhook subscription: ${error.message}. Nothing will arrive until that is fixed.`;
    }
  }

  // Best effort: a display number makes the Numbers list readable, and
  // not having one is no reason to fail an onboarding that worked.
  let displayPhoneNumber: string | null = null;
  try {
    const info = await getPhoneNumberInfo(phoneNumberId, accessToken);
    displayPhoneNumber = info.display_phone_number ?? null;
  } catch {
    displayPhoneNumber = null;
  }

  const created = await insertOrReviveNumber({
    phoneNumberId,
    label,
    displayPhoneNumber,
    mode: "coexistence",
    counsellorId,
    // A stranger messaging a counsellor's own phone to ask about NIFT
    // coaching is the highest-intent enquiry this institute gets.
    // That is the whole reason for Coexistence, so it is on by default
    // here — and still an editable box on the row afterwards.
    createsLeads: true,
  });

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "whatsapp_number.onboarded",
    entityType: "whatsapp_numbers",
    entityId: created.id,
    // No token, obviously. The ids are not secret and are what somebody
    // needs to trace this back to the right account in Meta.
    after: { phoneNumberId, wabaId, label, counsellorId, mode: "coexistence", codeExchangedWith: redirectForm },
  });

  revalidatePath("/settings/integrations/whatsapp");
  return {
    success:
      `${label} is connected.` +
      (keptExisting.length > 0 ? " The institute's saved WhatsApp credentials were left as they were, so broadcasts still go from the API number." : "") +
      (subscriptionNote || " Up to 180 days of one-to-one chats will arrive over the next few minutes."),
  };
}
