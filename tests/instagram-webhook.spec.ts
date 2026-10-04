/**
 * Integration test for the Instagram DM webhook — needs a real database
 * with migrations applied and INTEGRATION_ENCRYPTION_KEY set:
 *
 *   npm run db:migrate && npm test
 *
 * Mocks only the profile lookup (the one network call). Signature
 * verification, `webhook_events` persistence and the conversation upsert
 * all run for real against Postgres — the same standard as the Meta Lead
 * Ads suite next door.
 *
 * The thing worth testing hardest: an Instagram DM must NOT create a lead
 * (docs/DECISIONS.md, 2026-10-04). That is a deliberate difference from
 * every other inbound channel, so it is the sort of thing a later change
 * could undo by accident while looking like an improvement.
 */
import { createHmac, randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — see the file header for how to run this suite.");
}
if (!process.env.INTEGRATION_ENCRYPTION_KEY) {
  throw new Error("INTEGRATION_ENCRYPTION_KEY is not set — see .env.local.");
}

vi.mock("../src/lib/integrations/instagram/graph-client", () => ({
  fetchInstagramProfile: vi.fn(),
  sendInstagramMessage: vi.fn(),
}));

const { fetchInstagramProfile } = await import("../src/lib/integrations/instagram/graph-client");
const { GET, POST } = await import("../src/app/api/webhooks/instagram/route");
const { db } = await import("../src/lib/db/client");
const { instagramConversations, instagramMessages, leads, webhookEvents } = await import(
  "../src/lib/db/schema"
);
const { setIntegrationCredential, deleteIntegrationCredential } = await import(
  "../src/lib/integrations/credentials"
);

const APP_SECRET = "test-ig-app-secret";
const VERIFY_TOKEN = "test-ig-verify-token";
/** Namespaced so the sweep cannot touch anything another suite created. */
const IGSID = "igtest-1000000001";

function sign(body: string): string {
  return `sha256=${createHmac("sha256", APP_SECRET).update(body, "utf8").digest("hex")}`;
}

function dm(messageId: string, text: string, igUserId = IGSID): string {
  return JSON.stringify({
    object: "instagram",
    entry: [
      {
        id: "ig-account-1",
        time: Date.now(),
        messaging: [
          {
            sender: { id: igUserId },
            recipient: { id: "ig-account-1" },
            timestamp: Date.now(),
            message: { mid: messageId, text },
          },
        ],
      },
    ],
  });
}

function post(body: string, signature = sign(body)): Promise<Response> {
  return POST(
    new Request("https://example.com/api/webhooks/instagram", {
      method: "POST",
      headers: { "x-hub-signature-256": signature },
      body,
    }),
  );
}

async function sweep() {
  const rows = await db
    .select({ id: instagramConversations.id })
    .from(instagramConversations)
    .where(eq(instagramConversations.igUserId, IGSID));
  const ids = rows.map((r) => r.id);
  if (ids.length > 0) {
    await db.delete(instagramMessages).where(inArray(instagramMessages.conversationId, ids));
    await db.delete(instagramConversations).where(inArray(instagramConversations.id, ids));
  }
  await db.delete(webhookEvents).where(eq(webhookEvents.source, "instagram"));
}

beforeAll(async () => {
  await sweep();
  await setIntegrationCredential("meta", "app_secret", APP_SECRET);
  await setIntegrationCredential("meta", "verify_token", VERIFY_TOKEN);
  await setIntegrationCredential("meta", "page_access_token", "fake-page-token");
});

afterAll(async () => {
  await sweep();
  await deleteIntegrationCredential("meta", "app_secret");
  await deleteIntegrationCredential("meta", "verify_token");
  await deleteIntegrationCredential("meta", "page_access_token");
});

beforeEach(() => {
  vi.mocked(fetchInstagramProfile).mockReset();
  vi.mocked(fetchInstagramProfile).mockResolvedValue({
    username: "divya.m",
    name: "Divya Menon",
    profilePicUrl: null,
  });
});

describe("GET /api/webhooks/instagram", () => {
  it("echoes the challenge for the Meta integration's own verify token", async () => {
    const res = await GET(
      new Request(
        `https://example.com/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=echo-ig`,
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("echo-ig");
  });

  it("rejects a wrong verify token", async () => {
    const res = await GET(
      new Request(
        "https://example.com/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=x",
      ),
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/webhooks/instagram", () => {
  it("rejects an unsigned delivery and still records it", async () => {
    const body = dm(randomUUID(), "hello");
    const res = await post(body, "sha256=deadbeef");
    expect(res.status).toBe(401);

    const [row] = await db.select().from(webhookEvents).where(eq(webhookEvents.source, "instagram"));
    expect(row.signatureOk).toBe(false);
    expect(row.status).toBe("failed");
  });

  it("stores a DM as a conversation and a message — and creates NO lead", async () => {
    const leadsBefore = await db.select({ id: leads.id }).from(leads);

    const messageId = `mid-${randomUUID()}`;
    const res = await post(dm(messageId, "Is the NIFT batch still open?"));
    expect(res.status).toBe(200);
    expect((await res.json()).stored).toBe(1);

    const [conversation] = await db
      .select()
      .from(instagramConversations)
      .where(eq(instagramConversations.igUserId, IGSID));
    expect(conversation).toBeDefined();
    expect(conversation.username).toBe("divya.m");
    expect(conversation.leadId).toBeNull();
    expect(conversation.unreadCount).toBe(1);
    expect(conversation.lastInboundAt).not.toBeNull();

    const messages = await db
      .select()
      .from(instagramMessages)
      .where(eq(instagramMessages.conversationId, conversation.id));
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toBe("Is the NIFT batch still open?");
    expect(messages[0].direction).toBe("inbound");

    // The decision, asserted: a DM is a conversation, not an enquiry.
    const leadsAfter = await db.select({ id: leads.id }).from(leads);
    expect(leadsAfter).toHaveLength(leadsBefore.length);
  });

  it("appends a second message to the same conversation and counts it unread", async () => {
    await post(dm(`mid-${randomUUID()}`, "second"));

    const [conversation] = await db
      .select()
      .from(instagramConversations)
      .where(eq(instagramConversations.igUserId, IGSID));
    expect(conversation.unreadCount).toBe(2);

    const messages = await db
      .select()
      .from(instagramMessages)
      .where(eq(instagramMessages.conversationId, conversation.id));
    expect(messages).toHaveLength(2);
  });

  it("does not look the profile up again once it has a handle", async () => {
    vi.mocked(fetchInstagramProfile).mockClear();
    await post(dm(`mid-${randomUUID()}`, "third"));
    expect(fetchInstagramProfile).not.toHaveBeenCalled();
  });

  it("does not double-post a redelivered message", async () => {
    // Meta retries any non-2xx, and a retry must not put the same message
    // into a counsellor's thread twice.
    const messageId = `mid-${randomUUID()}`;
    await post(dm(messageId, "retry me"));
    const second = await post(dm(messageId, "retry me"));
    expect(second.status).toBe(200);
    expect((await second.json()).stored).toBe(0);

    const [conversation] = await db
      .select()
      .from(instagramConversations)
      .where(eq(instagramConversations.igUserId, IGSID));
    const matching = (
      await db
        .select()
        .from(instagramMessages)
        .where(eq(instagramMessages.conversationId, conversation.id))
    ).filter((m) => m.igMessageId === messageId);
    expect(matching).toHaveLength(1);
  });

  it("records a signed callback that carried nothing to store, rather than staying silent", async () => {
    const body = JSON.stringify({
      object: "instagram",
      entry: [{ id: "ig-account-1", messaging: [{ sender: { id: IGSID }, read: { mid: "x" } }] }],
    });
    const res = await post(body);
    expect(res.status).toBe(200);
    expect((await res.json()).stored).toBe(0);

    const rows = await db.select().from(webhookEvents).where(eq(webhookEvents.source, "instagram"));
    const noMessage = rows.find((r) => r.externalId.startsWith("no-message:"));
    expect(noMessage?.status).toBe("done");
    expect(noMessage?.lastError).toContain("read receipt");
  });

  it("stores the message even when the profile lookup fails", async () => {
    // A display name is decoration. The message arriving is not.
    vi.mocked(fetchInstagramProfile).mockResolvedValue({
      username: null,
      name: null,
      profilePicUrl: null,
    });

    const other = "igtest-1000000002";
    const res = await post(dm(`mid-${randomUUID()}`, "anonymous", other));
    expect((await res.json()).stored).toBe(1);

    const [conversation] = await db
      .select()
      .from(instagramConversations)
      .where(eq(instagramConversations.igUserId, other));
    expect(conversation.username).toBeNull();

    await db.delete(instagramMessages).where(eq(instagramMessages.conversationId, conversation.id));
    await db.delete(instagramConversations).where(eq(instagramConversations.id, conversation.id));
  });
});
