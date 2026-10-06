import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { whatsappMessages, webhookEvents } from "@/lib/db/schema";
import { findLeadByPhone } from "@/lib/identity/find-lead-by-phone";
import { resolveOrCreateLead } from "@/lib/identity/resolve-or-create-lead";
import {
  OPT_IN_KEYWORD_CATEGORY,
  OPT_OUT_KEYWORD_CATEGORY,
  matchesKeyword,
  releasePhone,
  suppressPhone,
} from "@/lib/whatsapp/opt-out";
import { resolveReply, startFlows } from "@/lib/whatsapp/flow-runner";
import { downloadMessageMedia, worthFetchingInline } from "@/lib/whatsapp/inbound-media";
import { activeDropdownValues } from "@/lib/config/dropdown-values";
import { normalizePhone } from "@/lib/identity/normalize-phone";
import { notify } from "@/lib/notifications/notify";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";
import {
  mapMessageContent,
  type WhatsAppContact,
  type WhatsAppInboundMessage,
} from "@/lib/integrations/whatsapp/map-inbound";
import { verifyMetaSignature } from "@/lib/integrations/meta/verify-signature";
import {
  describeContactSync,
  type CoexistenceValue,
  type EchoMessage,
  type HistoryEntry,
} from "@/lib/integrations/whatsapp/coexistence";
import {
  findNumber,
  handleHistory,
  recordKnownMessages,
  type CoexistenceNumber,
} from "@/lib/whatsapp/coexistence-handler";

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

  const expectedToken = (await getIntegrationCredentials("whatsapp", ["verify_token"]))
    .verify_token;

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
  /** Coexistence: what the business sent from the WhatsApp Business app. */
  message_echoes?: EchoMessage[];
  /** Coexistence: the 180-day backfill, in chunks. */
  history?: HistoryEntry[];
}

interface WhatsAppWebhookPayload {
  object?: string;
  entry?: Array<{ id?: string; changes?: Array<{ field: string; value: WhatsAppChangeValue }> }>;
}

async function persistInvalid(
  payload: WhatsAppWebhookPayload | null,
  rawBody: string,
  signatureOk: boolean,
) {
  await db.insert(webhookEvents).values({
    source: "whatsapp",
    externalId: `invalid:${randomUUID()}`,
    signatureOk,
    raw: (payload as unknown as Record<string, unknown>) ?? {
      unparsedBodyPreview: rawBody.slice(0, 2000),
    },
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
  const signatureOk =
    Boolean(appSecret) && verifyMetaSignature(rawBody, signatureHeader, appSecret ?? "");

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

      // Which of the institute's numbers this arrived on, and therefore
      // which rules apply. Null for a number nobody has registered on
      // Settings → Integrations → WhatsApp numbers, which is not an
      // error: the CRM ran on one implicit number for months and keeps
      // working for an institute that never opens that screen.
      const number = await findNumber(value.metadata?.phone_number_id);

      // ── Coexistence ────────────────────────────────────────────────
      //
      // Three fields only a coexistence number sends. Handled before the
      // ordinary `messages` loop because they are mutually exclusive with
      // it: one delivery carries one field.
      if (change.field === "smb_message_echoes" || change.field === "history") {
        if (!number) {
          // A coexistence delivery for a number we do not know about.
          // Recorded rather than dropped: the fix is adding the number,
          // and the payload is the evidence that it is sending.
          await recordUnknownNumberDelivery(change.field, value);
          continue;
        }
        const ok = await processCoexistence(change.field, value, number);
        if (!ok) allOk = false;
        continue;
      }

      if (change.field === "smb_app_state_sync") {
        // The phone's address book. Deliberately not imported — see
        // `describeContactSync()` for why a counsellor's contacts are
        // not prospective students.
        await recordContactSync(value, number);
        continue;
      }

      for (const message of value.messages ?? []) {
        const externalId = `msg:${message.id}`;
        const [inserted] = await db
          .insert(webhookEvents)
          .values({
            source: "whatsapp",
            externalId,
            signatureOk: true,
            raw: message as unknown as Record<string, unknown>,
          })
          .onConflictDoNothing({ target: [webhookEvents.source, webhookEvents.externalId] })
          .returning({ id: webhookEvents.id });
        if (!inserted) continue; // already processed on a previous delivery of this same message id

        try {
          // Whether an inbound message may create a lead is a property of
          // the NUMBER, not of this handler.
          //
          // On the institute's broadcast number it must not: a reply
          // there is somebody who pressed a button on a campaign, and
          // manufacturing a lead from it fills the pipeline with people
          // who never enquired — and puts "whatsapp" on the first-touch
          // source of somebody who actually came from Meta.
          //
          // On a counsellor's own coexistence number the opposite holds.
          // A stranger messaging a counsellor to ask about NIFT coaching
          // is the highest-intent enquiry this institute gets, and until
          // Coexistence it was typed in by hand or lost. So that number
          // is marked `creates_leads` and the lead goes through
          // `resolveOrCreateLead()` like every other source — assigned
          // to whoever owns the phone, because they are already holding
          // the conversation.
          let matched = await findLeadByPhone(message.from);

          if (!matched && number?.createsLeads) {
            const profileName = value.contacts?.find((c) => c.wa_id === message.from)?.profile?.name;
            await resolveOrCreateLead({
              // WhatsApp gives a profile name, which is whatever the
              // person set — often a nickname, sometimes an emoji. Kept
              // anyway: a counsellor renames it on first contact, and a
              // lead called "Appu 🌸" is more use than one called
              // "WhatsApp enquiry".
              studentName: profileName?.trim() || `WhatsApp ${message.from.slice(-4)}`,
              primaryPhone: message.from,
              source: "WhatsApp",
              subSource: number.label,
              assignedTo: number.counsellorId,
              raw: message as unknown as Record<string, unknown>,
              dedupeKey: `wa:${message.id}`,
            });
            matched = await findLeadByPhone(message.from);
          }

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
          const [storedMessage] = await db
            .insert(whatsappMessages)
            .values({
              leadId: matched?.id ?? null,
              // Falls back to the number's owner so an unmatched message
              // on a counsellor's coexistence number is visible to that
              // counsellor: migration 0090's SELECT shows a lead-less row
              // to whoever runs campaigns or to the counsellor named
              // here, and a null here meant only the former.
              counsellorId: matched?.assignedTo ?? number?.counsellorId ?? null,
              direction: "inbound",
              waMessageId: message.id,
              fromPhone: normalizePhone(message.from) ?? message.from,
              toPhone:
                value.metadata?.display_phone_number ?? value.metadata?.phone_number_id ?? "",
              messageType: content.messageType,
              body: content.body,
              mediaId: content.mediaId,
              mediaMimeType: content.mediaMimeType,
              status: "received",
              occurredAt: new Date(Number(message.timestamp) * 1000),
            })
            .returning({ id: whatsappMessages.id });

          // A photo is a few hundred kilobytes and worth fetching now, so
          // it is on the counsellor's screen before they have finished
          // reading the message. Anything larger waits for the sweep:
          // Meta retries a slow webhook, and a retried webhook is a
          // duplicated message. Either way the failure is contained —
          // the message row is already written.
          if (storedMessage && content.mediaId && worthFetchingInline(content.mediaMimeType)) {
            await downloadMessageMedia({
              id: storedMessage.id,
              mediaId: content.mediaId,
              mediaMimeType: content.mediaMimeType,
              leadId: matched?.id ?? null,
              attempts: 0,
            }).catch(() => {});
          }

          await db
            .update(webhookEvents)
            .set({
              status: "done",
              processedAt: new Date(),
              attempts: sql`${webhookEvents.attempts} + 1`,
            })
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
            .set({
              status: "failed",
              attempts: sql`${webhookEvents.attempts} + 1`,
              lastError: err instanceof Error ? err.message : String(err),
            })
            .where(eq(webhookEvents.id, inserted.id));
        }
      }

      for (const status of value.statuses ?? []) {
        const externalId = `status:${status.id}:${status.status}`;
        const [inserted] = await db
          .insert(webhookEvents)
          .values({
            source: "whatsapp",
            externalId,
            signatureOk: true,
            raw: status as unknown as Record<string, unknown>,
          })
          .onConflictDoNothing({ target: [webhookEvents.source, webhookEvents.externalId] })
          .returning({ id: webhookEvents.id });
        if (!inserted) continue; // this exact status transition was already recorded

        try {
          await db
            .update(whatsappMessages)
            .set({
              status: status.status,
              errorMessage: status.errors?.[0]?.title ?? status.errors?.[0]?.message ?? null,
            })
            .where(eq(whatsappMessages.waMessageId, status.id));

          await db
            .update(webhookEvents)
            .set({
              status: "done",
              processedAt: new Date(),
              attempts: sql`${webhookEvents.attempts} + 1`,
            })
            .where(eq(webhookEvents.id, inserted.id));
        } catch (err) {
          allOk = false;
          await db
            .update(webhookEvents)
            .set({
              status: "failed",
              attempts: sql`${webhookEvents.attempts} + 1`,
              lastError: err instanceof Error ? err.message : String(err),
            })
            .where(eq(webhookEvents.id, inserted.id));
        }
      }
    }
  }

  return NextResponse.json({ ok: allOk }, { status: allOk ? 200 : 500 });
}

/**
 * One coexistence delivery: echoed messages, or a chunk of history.
 *
 * Persist first, then process — the same order as everything else here
 * (non-negotiable #9). The external id is the field plus Meta's own
 * message id where there is one, so a redelivered chunk is recognised
 * rather than duplicating six months of somebody's conversation.
 *
 * Returns false when it failed, so the endpoint answers non-2xx and Meta
 * retries. A lost history chunk is not recoverable by any other means:
 * the backfill is sent once, minutes after onboarding, and there is no
 * endpoint to ask for it again.
 */
async function processCoexistence(
  field: "smb_message_echoes" | "history",
  value: WhatsAppChangeValue,
  number: CoexistenceNumber,
): Promise<boolean> {
  const externalId =
    field === "smb_message_echoes"
      ? `echo:${value.message_echoes?.[0]?.id ?? randomUUID()}`
      : `history:${number.id}:${value.history?.[0]?.metadata?.phase ?? "x"}:${
          value.history?.[0]?.metadata?.chunk_order ?? randomUUID()
        }`;

  const [inserted] = await db
    .insert(webhookEvents)
    .values({
      source: "whatsapp",
      externalId,
      signatureOk: true,
      raw: value as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing({ target: [webhookEvents.source, webhookEvents.externalId] })
    .returning({ id: webhookEvents.id });
  if (!inserted) return true; // already handled on an earlier delivery

  try {
    const note =
      field === "history"
        ? await handleHistory(value, number)
        : await describeEchoes(value, number);

    await db
      .update(webhookEvents)
      .set({
        status: "done",
        processedAt: new Date(),
        attempts: sql`${webhookEvents.attempts} + 1`,
        // Not an error. The delivery record is the only place somebody
        // can see whether the backfill actually brought anything in, and
        // "done" on its own does not say.
        lastError: note,
      })
      .where(eq(webhookEvents.id, inserted.id));
    return true;
  } catch (err) {
    await db
      .update(webhookEvents)
      .set({
        status: "failed",
        attempts: sql`${webhookEvents.attempts} + 1`,
        lastError: err instanceof Error ? err.message : String(err),
      })
      .where(eq(webhookEvents.id, inserted.id));
    return false;
  }
}

/** Messages the counsellor sent from the phone, and what became of them. */
async function describeEchoes(
  value: WhatsAppChangeValue,
  number: CoexistenceNumber,
): Promise<string> {
  const result = await recordKnownMessages(
    value.message_echoes ?? [],
    number,
    value.metadata?.display_phone_number,
    // A live conversation on this counsellor's phone. One with somebody
    // not yet in the CRM is kept with no lead on it, so it shows under
    // "Not in the CRM" and can be converted when it becomes an enquiry
    // — see recordKnownMessages' own note on why the backfill does not
    // do the same.
    { keepUnmatched: true },
  );
  return (
    `Sent from the phone: ${result.stored} recorded, ` +
    `${result.skipped} skipped (already recorded, or unreadable).`
  );
}

/**
 * A coexistence delivery for a number nobody has registered.
 *
 * Recorded rather than dropped, because the fix is adding the number on
 * Settings → Integrations and this payload is the evidence that it is
 * already sending. Unlike a custom webhook's unknown token, this one
 * passed the account's own signature check, so it is genuinely ours.
 */
async function recordUnknownNumberDelivery(
  field: string,
  value: WhatsAppChangeValue,
): Promise<void> {
  await db
    .insert(webhookEvents)
    .values({
      source: "whatsapp",
      externalId: `unregistered:${field}:${value.metadata?.phone_number_id ?? randomUUID()}`,
      signatureOk: true,
      raw: value as unknown as Record<string, unknown>,
      status: "failed",
      lastError:
        `${field} arrived for phone number id ${value.metadata?.phone_number_id ?? "(none given)"}, ` +
        `which is not registered. Add it in Settings → Integrations → WhatsApp so its messages are kept.`,
    })
    .onConflictDoUpdate({
      target: [webhookEvents.source, webhookEvents.externalId],
      // One row per unregistered number rather than one per delivery:
      // the message is the same every time and a wall of identical rows
      // would bury everything else on the deliveries panel.
      set: { receivedAt: new Date(), attempts: sql`${webhookEvents.attempts} + 1` },
    });
}

/**
 * The phone's address book, recorded and not imported.
 *
 * `describeContactSync()` carries the reasoning: a counsellor's contacts
 * are their dentist and their landlord as much as any prospective
 * student, and importing them would fill the pipeline with people who
 * never enquired while quietly moving personal contacts into a system the
 * whole centre can read.
 */
async function recordContactSync(
  value: WhatsAppChangeValue,
  number: CoexistenceNumber | null,
): Promise<void> {
  await db
    .insert(webhookEvents)
    .values({
      source: "whatsapp",
      externalId: `contacts:${number?.id ?? value.metadata?.phone_number_id ?? randomUUID()}:${Date.now()}`,
      signatureOk: true,
      raw: value as unknown as Record<string, unknown>,
      status: "done",
      processedAt: new Date(),
      lastError: describeContactSync(value as CoexistenceValue),
    })
    .onConflictDoNothing({ target: [webhookEvents.source, webhookEvents.externalId] });
}
