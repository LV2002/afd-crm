import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { whatsappMessages, webhookEvents } from "@/lib/db/schema";
import { findLeadByPhone } from "@/lib/identity/find-lead-by-phone";
import {
  OPT_IN_KEYWORD_CATEGORY,
  OPT_OUT_KEYWORD_CATEGORY,
  matchesKeyword,
  releasePhone,
  suppressPhone,
} from "@/lib/whatsapp/opt-out";
import { resolveReply, startFlows } from "@/lib/whatsapp/flow-runner";
import { activeDropdownValues } from "@/lib/config/dropdown-values";
import { normalizePhone } from "@/lib/identity/normalize-phone";
import { notify } from "@/lib/notifications/notify";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";
import { mapMessageContent, type WhatsAppContact, type WhatsAppInboundMessage } from "@/lib/integrations/whatsapp/map-inbound";
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

  // Read once per delivery rather than per message: a batch can carry
  // several, and this is two small config reads either way.
  const [optOutKeywords, optInKeywords] = await Promise.all([
    activeDropdownValues(OPT_OUT_KEYWORD_CATEGORY),
    activeDropdownValues(OPT_IN_KEYWORD_CATEGORY),
  ]);

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
          // This number sends marketing and receives the replies to it —
          // it is not a way into the pipeline. AFD's enquiries arrive on
          // the counsellors' own WhatsApp Business apps and are entered
          // by hand, so an inbound message here is matched to a lead that
          // already exists and NEVER creates one. Creating leads from
          // broadcast replies would fill the pipeline with people who
          // pressed a button, and would put "whatsapp" on the
          // first-touch source of someone who actually came from Meta.
          const matched = await findLeadByPhone(message.from);

          const content = mapMessageContent(message);

          // Before anything else. WhatsApp expects a business to honour
          // an opt-out, and a number that ignores one loses its quality
          // rating and eventually its access — which, on one institute
          // number, is the whole institute's marketing. The keywords are
          // dropdown_options, so an admin changes them without a deploy.
          const optOut = matchesKeyword(content.body, optOutKeywords);
          const optIn = optOut ? null : matchesKeyword(content.body, optInKeywords);
          if (optOut) {
            await suppressPhone(db, {
              phone: message.from,
              reason: optOut,
              source: "keyword",
            });
          } else if (optIn) {
            await releasePhone(db, { phone: message.from });
          }
          await db.insert(whatsappMessages).values({
            leadId: matched?.id ?? null,
            counsellorId: matched?.assignedTo ?? null,
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

          // Leon's rule: a broadcast reply is the assigned counsellor's
          // to answer, and nobody else's business. notify() honours the
          // per-event settings, so an admin can widen that later without
          // a deploy — the default is the owner alone.
          //
          // An unmatched reply notifies nobody: there is no counsellor to
          // tell, and it is visible to whoever runs campaigns on the
          // WhatsApp inbox instead.
          // Automation flows, before the notification.
          //
          // A run parked on "wait for their reply" branches HERE, in the
          // webhook, rather than at the next sweep — a quick-reply button
          // that takes a week to do anything is not a button, it is a
          // form. Both calls swallow their own failures: a broken flow
          // must not stop a message being recorded.
          //
          // Only when they have not opted out. Somebody whose message was
          // "STOP" is not somebody to answer with an automation.
          if (matched && !optOut) {
            await resolveReply(matched.id, content.body);
            await startFlows("inbound_keyword", { leadId: matched.id, text: content.body });
          }

          if (matched) {
            await notify({
              eventKey: "whatsapp.reply_received",
              context: {
                lead_name: matched.studentName,
                lead_number: matched.leadNumber,
                message: content.body ?? "(no text)",
              },
              href: `/leads/${matched.id}`,
              entityType: "leads",
              entityId: matched.id,
              centerId: matched.centerId,
              ownerId: matched.assignedTo,
            });
          }
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
