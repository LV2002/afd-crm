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
  setIntegrationCredential,
} from "@/lib/integrations/credentials";
import { MetaGraphApiError } from "@/lib/integrations/meta/graph-client";
import {
  exchangeSignupCode,
  getPhoneNumberInfo,
  subscribeAppToWaba,
} from "@/lib/integrations/whatsapp/client";
import { createClient } from "@/lib/supabase/server";

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
  wabaId: z.string().trim().regex(/^\d+$/, "Meta returned an account id that is not a number."),
  phoneNumberId: z
    .string()
    .trim()
    .regex(/^\d+$/, "Meta returned a phone number id that is not a number."),
  label: z.string().trim().min(1, "Give the number a label you will recognise.").max(120),
  counsellorId: z.string().uuid("Choose whose phone this is."),
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
  const { code, wabaId, phoneNumberId, label, counsellorId } = parsed.data;

  const appId = await getIntegrationCredential("whatsapp", "app_id");
  const appSecret = await getIntegrationCredential("whatsapp", "app_secret");
  if (!appId || !appSecret) {
    return {
      error: "Save the App ID and App Secret above before connecting a number — the code Meta returns is exchanged with them.",
    };
  }

  // Registered already? Say so before spending the single-use code, so
  // the person is not told to run the dialog again over a duplicate.
  const [clash] = await db
    .select({ label: whatsappNumbers.label })
    .from(whatsappNumbers)
    .where(and(eq(whatsappNumbers.phoneNumberId, phoneNumberId), isNull(whatsappNumbers.deletedAt)));
  if (clash) {
    return { error: `That number is already registered here as "${clash.label}".` };
  }

  let accessToken: string;
  try {
    accessToken = await exchangeSignupCode(appId, appSecret, code);
  } catch (error) {
    if (error instanceof MetaGraphApiError) {
      return {
        error: `Meta would not exchange the code: ${error.message}. The code expires quickly — run the connection again.`,
      };
    }
    throw error;
  }

  await setIntegrationCredential("whatsapp", "access_token", accessToken);
  await setIntegrationCredential("whatsapp", "waba_id", wabaId);
  await setIntegrationCredential("whatsapp", "phone_number_id", phoneNumberId);

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

  const [created] = await db
    .insert(whatsappNumbers)
    .values({
      phoneNumberId,
      label,
      displayPhoneNumber,
      mode: "coexistence",
      counsellorId,
      // A stranger messaging a counsellor's own phone to ask about NIFT
      // coaching is the highest-intent enquiry this institute gets. That
      // is the whole reason for Coexistence, so it is on by default here
      // — and still an editable box on the row afterwards.
      createsLeads: true,
    })
    .returning({ id: whatsappNumbers.id });

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "whatsapp_number.onboarded",
    entityType: "whatsapp_numbers",
    entityId: created.id,
    // No token, obviously. The ids are not secret and are what somebody
    // needs to trace this back to the right account in Meta.
    after: { phoneNumberId, wabaId, label, counsellorId, mode: "coexistence" },
  });

  revalidatePath("/settings/integrations/whatsapp");
  return {
    success: `${label} is connected.${subscriptionNote || " Up to 180 days of one-to-one chats will arrive over the next few minutes."}`,
  };
}
