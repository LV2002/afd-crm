import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { instagramConversations, instagramMessages, webhookEvents } from "@/lib/db/schema";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";
import { fetchInstagramProfile } from "@/lib/integrations/instagram/graph-client";
import {
  describeIgnoredEvents,
  mapInstagramWebhook,
  type InboundInstagramMessage,
  type InstagramWebhookPayload,
} from "@/lib/integrations/instagram/map-webhook";
import { verifyMetaSignature } from "@/lib/integrations/meta/verify-signature";

export const dynamic = "force-dynamic";

/**
 * Meta's webhook subscription handshake. Shares the Meta integration's
 * `verify_token` — it is the same app, and asking an admin to invent a
 * second password for the second callback URL on the same app would be
 * ceremony, not security.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expectedToken = (await getIntegrationCredentials("meta", ["verify_token"])).verify_token;

  if (mode === "subscribe" && expectedToken && token === expectedToken) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

/**
 * Instagram DMs in.
 *
 * CLAUDE.md non-negotiable #9: verify → persist → process, in that order,
 * every time, and never catch-and-200. Same shape as the Lead Ads webhook
 * next door, with one deliberate difference that is the whole point of
 * this channel: **an Instagram message does not create a lead**
 * (docs/DECISIONS.md, 2026-10-04). It creates or appends to a
 * conversation. A counsellor presses **Convert to lead** when it turns
 * into a real enquiry, and that runs `resolveOrCreateLead()` like every
 * other source.
 *
 * So there is no identity resolution here at all, and nothing to get
 * wrong about it: the correspondent is their Instagram-scoped id until a
 * human says otherwise.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-hub-signature-256");

  const { app_secret: appSecret, page_access_token: pageAccessToken } =
    await getIntegrationCredentials("meta", ["app_secret", "page_access_token"]);

  const signatureOk = Boolean(appSecret) && verifyMetaSignature(rawBody, signatureHeader, appSecret ?? "");

  let payload: InstagramWebhookPayload | null = null;
  try {
    payload = JSON.parse(rawBody) as InstagramWebhookPayload;
  } catch {
    payload = null;
  }

  if (!signatureOk || !payload) {
    // Logged for forensics before being rejected — "persist before
    // processing" applies to a rejected request too.
    await db.insert(webhookEvents).values({
      source: "instagram",
      externalId: `invalid:${randomUUID()}`,
      signatureOk,
      raw: (payload as unknown as Record<string, unknown>) ?? { unparsedBodyPreview: rawBody.slice(0, 2000) },
      status: "failed",
      lastError: !signatureOk ? "Invalid or missing X-Hub-Signature-256" : "Body was not valid JSON",
    });
    return NextResponse.json({ error: "Invalid request" }, { status: signatureOk ? 400 : 401 });
  }

  const { messages, ignored } = mapInstagramWebhook(payload);

  if (messages.length === 0) {
    /*
      A real, correctly-signed callback that carried no new message: a
      read receipt, a reaction, an echo of something we sent. Recorded
      anyway, for the same reason the Lead Ads webhook records its
      no-lead callbacks — otherwise an empty delivery list means both
      "Meta never called" and "Meta called and we said nothing", and only
      one of those is a reason to go and look at the Meta side.
    */
    await db.insert(webhookEvents).values({
      source: "instagram",
      externalId: `no-message:${randomUUID()}`,
      signatureOk: true,
      raw: payload as unknown as Record<string, unknown>,
      status: "done",
      processedAt: new Date(),
      lastError: describeIgnoredEvents(ignored.length > 0 ? ignored : ["no messaging events at all"]),
    });
    return NextResponse.json({ ok: true, stored: 0 });
  }

  let allOk = true;
  let stored = 0;

  for (const message of messages) {
    // One row per message id, which is the idempotency key: Meta retries
    // on any non-2xx, and a retry must not double-post a message into a
    // counsellor's thread.
    const [inserted] = await db
      .insert(webhookEvents)
      .values({
        source: "instagram",
        externalId: message.igMessageId,
        signatureOk: true,
        raw: payload as unknown as Record<string, unknown>,
      })
      .onConflictDoNothing({ target: [webhookEvents.source, webhookEvents.externalId] })
      .returning({ id: webhookEvents.id });

    if (!inserted) continue; // already processed on an earlier delivery

    try {
      await storeInboundMessage(message, pageAccessToken ?? null);
      stored += 1;

      await db
        .update(webhookEvents)
        .set({ status: "done", processedAt: new Date(), attempts: sql`${webhookEvents.attempts} + 1` })
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

  // Non-2xx on genuine failure so Meta retries; the ones that already
  // succeeded are skipped by the conflict clause above, so a retry only
  // re-attempts what actually failed.
  return NextResponse.json({ ok: allOk, stored }, { status: allOk ? 200 : 500 });
}

/**
 * The conversation, then the message, in one transaction — so a thread
 * can never exist with a bumped `last_message_at` and no message under
 * it, which is what an inbox would render as an empty chat.
 */
async function storeInboundMessage(
  message: InboundInstagramMessage,
  pageAccessToken: string | null,
): Promise<void> {
  /*
    Looked up before the transaction, not inside it. `db`'s pool is
    max: 1 (see lib/db/client.ts) and this is a network call: holding the
    only connection open across a Graph API round trip is how a webhook
    times out and gets retried. Decoration must never be in the way of
    the message arriving — fetchInstagramProfile() returns nulls rather
    than throwing for the same reason.
  */
  const [existing] = await db
    .select({ id: instagramConversations.id, username: instagramConversations.username })
    .from(instagramConversations)
    .where(eq(instagramConversations.igUserId, message.igUserId));

  const profile =
    !existing?.username && pageAccessToken
      ? await fetchInstagramProfile(message.igUserId, pageAccessToken)
      : null;

  await db.transaction(async (tx) => {
    const [conversation] = await tx
      .insert(instagramConversations)
      .values({
        igUserId: message.igUserId,
        username: profile?.username ?? null,
        name: profile?.name ?? null,
        profilePicUrl: profile?.profilePicUrl ?? null,
        lastMessageAt: message.sentAt,
        lastInboundAt: message.sentAt,
        unreadCount: 1,
      })
      .onConflictDoUpdate({
        target: instagramConversations.igUserId,
        set: {
          lastMessageAt: message.sentAt,
          lastInboundAt: message.sentAt,
          unreadCount: sql`${instagramConversations.unreadCount} + 1`,
          // Only ever fills a blank in — a handle fetched once is not
          // re-fetched, and a profile lookup that failed must not wipe
          // the name we already had.
          username: sql`coalesce(${instagramConversations.username}, ${profile?.username ?? null})`,
          name: sql`coalesce(${instagramConversations.name}, ${profile?.name ?? null})`,
          profilePicUrl: sql`coalesce(${instagramConversations.profilePicUrl}, ${profile?.profilePicUrl ?? null})`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: instagramConversations.id });

    await tx
      .insert(instagramMessages)
      .values({
        conversationId: conversation.id,
        direction: "inbound",
        igMessageId: message.igMessageId,
        body: message.body,
        attachmentType: message.attachmentType,
        attachmentUrl: message.attachmentUrl,
        replyToStory: message.replyToStory,
        status: "received",
        sentAt: message.sentAt,
      })
      .onConflictDoNothing({ target: instagramMessages.igMessageId });
  });
}
