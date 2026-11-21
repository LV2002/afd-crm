"use server";

import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { webhookEvents, whatsappMessages, whatsappNumbers } from "@/lib/db/schema";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";
import { MetaGraphApiError } from "@/lib/integrations/meta/graph-client";
import {
  fetchAppWebhookSubscription,
  fetchWabaSubscribedApps,
  setAppWebhookFields,
  type AppWebhookSubscription,
} from "@/lib/integrations/whatsapp/client";
import { createClient } from "@/lib/supabase/server";
import { evaluateCoexistenceCheck, missingFields, type CheckLine, type DeliveryActivity } from "@/lib/whatsapp/coexistence-check";

export interface CoexistenceCheckState {
  error?: string;
  success?: string;
  lines?: CheckLine[];
}

async function expectedCallback(): Promise<string | null> {
  const host = (await headers()).get("host");
  return host ? `https://${host}/api/webhooks/whatsapp` : null;
}

const THIRTY_DAYS = 30 * 86_400_000;

/** What Meta has actually delivered, by kind. The webhook names each kind in the event's external id. */
async function deliveryActivity(): Promise<DeliveryActivity> {
  const since = new Date(Date.now() - THIRTY_DAYS);
  const rows = await db
    .select({
      kind: sql<string>`split_part(${webhookEvents.externalId}, ':', 1)`,
      count: sql<number>`count(*)::int`,
      last: sql<string>`max(${webhookEvents.receivedAt})`,
    })
    .from(webhookEvents)
    .where(and(eq(webhookEvents.source, "whatsapp"), eq(webhookEvents.signatureOk, true), gt(webhookEvents.receivedAt, since)))
    .groupBy(sql`split_part(${webhookEvents.externalId}, ':', 1)`);
  const kind = (name: string) => {
    const row = rows.find((r) => r.kind === name);
    return { count: row?.count ?? 0, last: row?.last ? new Date(row.last) : null };
  };
  const unregistered = await db
    .select({ detail: webhookEvents.lastError, at: webhookEvents.receivedAt })
    .from(webhookEvents)
    .where(and(eq(webhookEvents.source, "whatsapp"), sql`${webhookEvents.externalId} like 'unregistered:%'`, gt(webhookEvents.receivedAt, since)))
    .orderBy(desc(webhookEvents.receivedAt))
    .limit(3);
  const perNumberRows = await db
    .select({
      label: whatsappNumbers.label,
      count: sql<number>`count(${whatsappMessages.id})::int`,
      last: sql<string>`max(${whatsappMessages.occurredAt})`,
    })
    .from(whatsappNumbers)
    .leftJoin(
      whatsappMessages,
      and(eq(whatsappMessages.numberId, whatsappNumbers.id), eq(whatsappMessages.direction, "inbound"), gt(whatsappMessages.occurredAt, since), isNull(whatsappMessages.deletedAt)),
    )
    .where(and(eq(whatsappNumbers.mode, "coexistence"), isNull(whatsappNumbers.deletedAt)))
    .groupBy(whatsappNumbers.id, whatsappNumbers.label);
  return {
    perNumber: perNumberRows.map((r) => ({ label: r.label, inbound: { count: r.count, last: r.last ? new Date(r.last) : null } })),
    messages: kind("msg"),
    echoes: kind("echo"),
    history: kind("history"),
    statuses: kind("status"),
    unregistered: unregistered.map((u) => ({ detail: u.detail ?? "", at: u.at })),
  };
}

async function gather() {
  const creds = await getIntegrationCredentials("whatsapp", ["app_id", "app_secret", "verify_token", "access_token", "waba_id"]);
  const appId = creds.app_id;
  const appSecret = creds.app_secret;

  let subscription: AppWebhookSubscription | null | undefined;
  let subscriptionError: string | undefined;
  if (appId && appSecret) {
    try {
      subscription = await fetchAppWebhookSubscription(appId, appSecret);
    } catch (err) {
      subscription = undefined;
      subscriptionError = err instanceof MetaGraphApiError ? `Meta said: ${err.message}` : "Could not reach Meta.";
    }
  }

  let wabaSubscribed: boolean | undefined;
  if (creds.waba_id && creds.access_token && appId) {
    try {
      wabaSubscribed = (await fetchWabaSubscribedApps(creds.waba_id, creds.access_token)).includes(appId);
    } catch {
      wabaSubscribed = undefined;
    }
  }

  const numbers = await db
    .select({ id: whatsappNumbers.id })
    .from(whatsappNumbers)
    .where(and(eq(whatsappNumbers.mode, "coexistence"), isNull(whatsappNumbers.deletedAt)));
  const activity = await deliveryActivity();

  return {
    creds,
    subscription,
    subscriptionError,
    wabaSubscribed,
    coexistenceNumbers: numbers.length,
    activity,
  };
}

/** Reads Meta's side and says, line by line, what must be true for Coexistence chats to flow and whether it is. */
export async function runCoexistenceCheck(): Promise<CoexistenceCheckState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return { error: "You don't have permission to do that." };

  const g = await gather();
  const lines = evaluateCoexistenceCheck({
    hasAppCredentials: Boolean(g.creds.app_id && g.creds.app_secret),
    hasVerifyToken: Boolean(g.creds.verify_token),
    subscription: g.subscription,
    subscriptionError: g.subscriptionError,
    expectedCallback: await expectedCallback(),
    wabaSubscribed: g.wabaSubscribed,
    coexistenceNumbers: g.coexistenceNumbers,
    activity: g.activity,
  });
  return { lines };
}

/**
 * Ticks the webhook fields that are missing — `messages`, and the three
 * Coexistence fields when a Coexistence number is registered. Keeps the
 * fields already ticked and the address Meta already delivers to; only adds.
 * Meta re-verifies the address with the verify token while doing it.
 */
export async function tickMissingWebhookFields(): Promise<CoexistenceCheckState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return { error: "You don't have permission to do that." };

  const g = await gather();
  const { app_id: appId, app_secret: appSecret, verify_token: verifyToken } = g.creds;
  if (!appId || !appSecret) return { error: "Save the App ID and App Secret first." };
  if (!verifyToken) return { error: "Save the Verify Token first — Meta checks the webhook address with it." };
  if (g.subscription === undefined) return { error: g.subscriptionError ?? "Could not read the app's webhook settings." };

  const have = g.subscription?.fields ?? [];
  const missing = missingFields(have, g.coexistenceNumbers > 0);
  if (missing.length === 0) return { success: "Every field that is needed is already ticked." };

  const callbackUrl = g.subscription?.callbackUrl ?? (await expectedCallback());
  if (!callbackUrl) return { error: "Could not work out this CRM's webhook address." };

  try {
    await setAppWebhookFields(appId, appSecret, { callbackUrl, verifyToken, fields: [...have, ...missing] });
  } catch (err) {
    return {
      error:
        err instanceof MetaGraphApiError
          ? `Meta refused: ${err.message}. If it mentions verification, the Verify Token here must match the one Meta has, and this CRM must be reachable from the internet.`
          : "Could not reach Meta.",
    };
  }

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "whatsapp.webhook_fields_ticked",
    entityType: "integration_credentials",
    entityId: null,
    after: { added: missing },
  });
  revalidatePath("/settings/integrations/whatsapp");
  return { success: `Ticked: ${missing.join(", ")}. Send a message to the number and run the check again.` };
}
