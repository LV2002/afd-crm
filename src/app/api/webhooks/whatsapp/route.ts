import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { whatsappMessages, webhookEvents } from "@/lib/db/schema";
import { normalizePhone } from "@/lib/identity/normalize-phone";
import { resolveOrCreateLead } from "@/lib/identity/resolve-or-create-lead";
import { findScopeIdByCredentialValue, getIntegrationCredentials } from "@/lib/integrations/credentials";
import { buildResolveLeadInput, mapMessageContent, resolveContactName, type WhatsAppContact, type WhatsAppInboundMessage } from "@/lib/integrations/whatsapp/map-inbound";
import { verifyMetaSignature } from "@/lib/integrations/meta/verify-signature";

export const dynamic = "force-dynamic";

/**
 * Same webhook subscription handshake as Meta Lead Ads — the WhatsApp
 * Cloud API is the same underlying Meta Graph webhooks product, just a
 * different "field" subscription, so the GET verification dance and the
 * `X-Hub-Signature-256` HMAC on POST (see `verifyMetaSignature`, reused
 * directly, not reimplemented) are identical. `verify_token`/`app_secret`
 * are still stored under `provider = 'whatsapp'`, independently of Meta's
 * Lead Ads credentials, even if in practice Leon uses the same underlying
 * Meta App for both — that's his call to make by what he types into each
 * settings screen, not something this code should assume.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expectedToken = (await getIntegrationCredentials("whatsapp", ["verify_token"])).verify_token;

  if (mode === "subscribe" && expectedToken && token === expectedToken) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

interface WhatsAppStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ title?: string; message?: string }>;
}

interface WhatsAppChangeValue {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: WhatsAppContact[];
  messages?: WhatsAppInboundMessage[];
  statuses?: WhatsAppStatus[];
}

interface WhatsAppWebhookPayload {
  object?: string;
  entry?: Array<{ id?: string; changes?: Array<{ field: string; value: WhatsAppChangeValue }> }>;
}

async function persistInvalid(payload: WhatsAppWebhookPayload | null, rawBody: string, signatureOk: boolean) {
  await db.insert(webhookEvents).values({
    source: "whatsapp",
    externalId: `invalid:${randomUUID()}`,
    signatureOk,
    raw: (payload as unknown as Record<string, unknown>) ?? { unparsedBodyPreview: rawBody.slice(0, 2000) },
    status: "failed",
    lastError: !signatureOk ? "Invalid or missing X-Hub-Signature-256" : "Body was not valid JSON",
  });
}

/**
 * CLAUDE.md non-negotiable #9: verify -> persist -> process. Two kinds of
 * delivery share this one endpoint (Meta puts both under the "messages"
 * webhook field): an inbound message (routed through `resolveOrCreateLead`
 * like every other ingestion path — non-negotiable #8, "inbound WhatsApp"
 * is explicitly named there) and a delivery-status update for a message
 * this CRM sent (sent/delivered/read/failed), which updates the existing
 * `whatsapp_messages` row instead of creating anything.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-hub-signature-256");

  const { app_secret: appSecret } = await getIntegrationCredentials("whatsapp", ["app_secret"]);
  const signatureOk = Boolean(appSecret) && verifyMetaSignature(rawBody, signatureHeader, appSecret ?? "");

  let payload: WhatsAppWebhookPayload | null = null;
  try {
    payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;
  } catch {
    payload = null;
  }

  if (!signatureOk || !payload) {
    await persistInvalid(payload, rawBody, signatureOk);
    return NextResponse.json({ error: "Invalid request" }, { status: signatureOk ? 400 : 401 });
  }

  let allOk = true;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;

      for (const message of value.messages ?? []) {
        const externalId = `msg:${message.id}`;
        const [inserted] = await db
          .insert(webhookEvents)
          .values({ source: "whatsapp", externalId, signatureOk: true, raw: message as unknown as Record<string, unknown> })
          .onConflictDoNothing({ target: [webhookEvents.source, webhookEvents.externalId] })
          .returning({ id: webhookEvents.id });
        if (!inserted) continue; // already processed on a previous delivery of this same message id

        try {
          const counsellorId = value.metadata?.phone_number_id
            ? await findScopeIdByCredentialValue("whatsapp", "phone_number_id", value.metadata.phone_number_id)
            : null;
          const contact = value.contacts?.find((c) => c.wa_id === message.from);
          const contactName = resolveContactName(contact, message.from);

          const { leadId } = await resolveOrCreateLead(buildResolveLeadInput(message, contactName, counsellorId));

          const content = mapMessageContent(message);
          await db.insert(whatsappMessages).values({
            leadId,
            counsellorId,
            direction: "inbound",
            waMessageId: message.id,
            fromPhone: normalizePhone(message.from) ?? message.from,
            toPhone: value.metadata?.display_phone_number ?? value.metadata?.phone_number_id ?? "",
            messageType: content.messageType,
            body: content.body,
            mediaId: content.mediaId,
            mediaMimeType: content.mediaMimeType,
            status: "received",
            occurredAt: new Date(Number(message.timestamp) * 1000),
          });

          await db
            .update(webhookEvents)
            .set({ status: "done", processedAt: new Date(), attempts: sql`${webhookEvents.attempts} + 1` })
            .where(eq(webhookEvents.id, inserted.id));
        } catch (err) {
          allOk = false;
          await db
            .update(webhookEvents)
            .set({ status: "failed", attempts: sql`${webhookEvents.attempts} + 1`, lastError: err instanceof Error ? err.message : String(err) })
            .where(eq(webhookEvents.id, inserted.id));
        }
      }

      for (const status of value.statuses ?? []) {
        const externalId = `status:${status.id}:${status.status}`;
        const [inserted] = await db
          .insert(webhookEvents)
          .values({ source: "whatsapp", externalId, signatureOk: true, raw: status as unknown as Record<string, unknown> })
          .onConflictDoNothing({ target: [webhookEvents.source, webhookEvents.externalId] })
          .returning({ id: webhookEvents.id });
        if (!inserted) continue; // this exact status transition was already recorded

        try {
          await db
            .update(whatsappMessages)
            .set({ status: status.status, errorMessage: status.errors?.[0]?.title ?? status.errors?.[0]?.message ?? null })
            .where(eq(whatsappMessages.waMessageId, status.id));

          await db
            .update(webhookEvents)
            .set({ status: "done", processedAt: new Date(), attempts: sql`${webhookEvents.attempts} + 1` })
            .where(eq(webhookEvents.id, inserted.id));
        } catch (err) {
          allOk = false;
          await db
            .update(webhookEvents)
            .set({ status: "failed", attempts: sql`${webhookEvents.attempts} + 1`, lastError: err instanceof Error ? err.message : String(err) })
            .where(eq(webhookEvents.id, inserted.id));
        }
      }
    }
  }

  return NextResponse.json({ ok: allOk }, { status: allOk ? 200 : 500 });
}
