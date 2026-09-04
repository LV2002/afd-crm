/**
 * Integration test for the WhatsApp webhook route — needs a real database
 * with migrations applied and INTEGRATION_ENCRYPTION_KEY set:
 *
 *   npm run db:migrate && npm test
 *
 * No network calls to mock at all: unlike Meta Lead Ads, an inbound
 * WhatsApp message carries its full content in the webhook payload
 * itself, and a status callback is a pure database update — so every
 * assertion here runs the real code path (signature verification,
 * webhook_events persistence, resolveOrCreateLead(), counsellor routing,
 * status-callback correlation) against Postgres.
 */
import { createHmac, randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";
import { and, eq, isNull, like, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — see the file header for how to run this suite.");
}
if (!process.env.INTEGRATION_ENCRYPTION_KEY) {
  throw new Error("INTEGRATION_ENCRYPTION_KEY is not set — see .env.local.");
}

const { GET, POST } = await import("../src/app/api/webhooks/whatsapp/route");
const { db } = await import("../src/lib/db/client");
const { leadIdentifiers, leads, profiles, roles, webhookEvents, whatsappMessages } = await import("../src/lib/db/schema");
const { setIntegrationCredential, deleteIntegrationCredential } = await import("../src/lib/integrations/credentials");

const APP_SECRET = "test-wa-app-secret";
const VERIFY_TOKEN = "test-wa-verify-token";
const MARKER = "WhatsAppWebhookTest";
// AFD runs ONE WhatsApp Business API number for the whole institute, so
// this is the org-level credential, not a per-counsellor one. The number
// a message arrives on no longer says anything about who owns the
// conversation — the lead's own counsellor does.
const PHONE_NUMBER_ID = `${MARKER}-phone-number-id`;

// leads.assigned_to carries a real FK to profiles, so the counsellor this
// test routes to must be a real fixture row, not an arbitrary uuid — same
// technique as tests/rls.spec.ts's createFixtureProfile.
let COUNSELLOR_ID: string;

function sign(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

function messagePayload(overrides: { messageId?: string; from?: string; name?: string; body?: string } = {}) {
  const messageId = overrides.messageId ?? `wamid.${randomUUID()}`;
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: PHONE_NUMBER_ID, display_phone_number: "911234567890" },
              contacts: [{ profile: { name: overrides.name ?? `${MARKER} Contact` }, wa_id: overrides.from ?? "919847500301" }],
              messages: [
                {
                  id: messageId,
                  from: overrides.from ?? "919847500301",
                  timestamp: "1700000000",
                  type: "text",
                  text: { body: overrides.body ?? "Hi, interested in NID coaching" },
                },
              ],
            },
          },
        ],
      },
    ],
  });
}

function statusPayload(wamid: string, status: "sent" | "delivered" | "read" | "failed") {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: PHONE_NUMBER_ID },
              statuses: [{ id: wamid, status, timestamp: "1700000100", recipient_id: "919847500301" }],
            },
          },
        ],
      },
    ],
  });
}

/** Every number this file sends from, so the sweep can find rows that have no lead to find them by. */
const TEST_PHONE_PREFIX = "+9198475";

async function sweep() {
  const testLeads = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARKER}%`));
  for (const lead of testLeads) {
    await db.delete(whatsappMessages).where(eq(whatsappMessages.leadId, lead.id));
  }
  // An inbound message from a number the CRM doesn't have is stored with
  // NO lead, so deleting by lead leaves it behind — and a leftover from a
  // previous run then looks exactly like a webhook that processed the
  // same delivery twice. Found by that test failing on the second run.
  await db
    .delete(whatsappMessages)
    .where(and(isNull(whatsappMessages.leadId), like(whatsappMessages.fromPhone, `${TEST_PHONE_PREFIX}%`)));
  await db.delete(leads).where(like(leads.studentName, `${MARKER}%`));
  await db.delete(webhookEvents).where(eq(webhookEvents.source, "whatsapp"));
}

beforeAll(async () => {
  await sweep();

  const [counsellorRole] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, "counsellor"));
  if (!counsellorRole) throw new Error("Expected seeded role 'counsellor' — run `npm run db:seed` first.");

  // auth.users is Supabase-owned (see src/lib/db/schema/_helpers.ts) — a
  // real row needs a real id + email, same shape as
  // tests/rls.spec.ts's createFixtureProfile.
  COUNSELLOR_ID = randomUUID();
  const email = `${MARKER.toLowerCase()}.counsellor.${COUNSELLOR_ID.slice(0, 8)}@test.invalid`;
  await db.execute(sql`insert into auth.users (id, email) values (${COUNSELLOR_ID}, ${email})`);
  await db.insert(profiles).values({ id: COUNSELLOR_ID, fullName: `${MARKER} Counsellor`, email, roleId: counsellorRole.id });

  await setIntegrationCredential("whatsapp", "app_secret", APP_SECRET);
  await setIntegrationCredential("whatsapp", "verify_token", VERIFY_TOKEN);
  await setIntegrationCredential("whatsapp", "phone_number_id", PHONE_NUMBER_ID);
});

afterAll(async () => {
  await sweep();
  await deleteIntegrationCredential("whatsapp", "app_secret");
  await deleteIntegrationCredential("whatsapp", "verify_token");
  await deleteIntegrationCredential("whatsapp", "phone_number_id");
  await db.delete(profiles).where(eq(profiles.id, COUNSELLOR_ID));
  await db.execute(sql`delete from auth.users where id = ${COUNSELLOR_ID}`);
});

describe("GET /api/webhooks/whatsapp (verification handshake)", () => {
  it("echoes the challenge when the verify token matches", async () => {
    const req = new Request(`https://example.com/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=echo456`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("echo456");
  });

  it("rejects a wrong verify token", async () => {
    const req = new Request("https://example.com/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=echo456");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/webhooks/whatsapp (inbound messages)", () => {
  it("rejects a request with an invalid signature and logs it", async () => {
    const body = messagePayload();
    const req = new Request("https://example.com/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=deadbeef" },
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);

    const [row] = await db.select().from(webhookEvents).where(eq(webhookEvents.source, "whatsapp")).orderBy(webhookEvents.receivedAt);
    expect(row.signatureOk).toBe(false);
    expect(row.status).toBe("failed");
  });

  /**
   * The number is a broadcasting channel, not a way in: AFD's enquiries
   * reach the counsellors' own phones and are typed in by hand. A reply
   * from somebody nobody has entered is real, and worth seeing, but it is
   * not an enquiry — so it is recorded with no lead rather than
   * manufacturing one.
   */
  it("records a reply from an unknown number WITHOUT inventing a lead", async () => {
    const before = await db.select({ id: leads.id }).from(leads);

    const body = messagePayload({ from: "919847500302", name: `${MARKER} Stranger` });
    const req = new Request("https://example.com/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": sign(body, APP_SECRET) },
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const after = await db.select({ id: leads.id }).from(leads);
    expect(after).toHaveLength(before.length);

    const [message] = await db
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.fromPhone, "+919847500302"));
    expect(message).toBeDefined();
    expect(message.leadId).toBeNull();
    expect(message.counsellorId).toBeNull();
    expect(message.body).toBe("Hi, interested in NID coaching");
  });

  it("files a reply from a number the CRM already has onto that lead, and onto its counsellor", async () => {
    const [existing] = await db
      .insert(leads)
      .values({
        studentName: `${MARKER} Known Lead`,
        primaryPhone: "+919847500401",
        assignedTo: COUNSELLOR_ID,
      })
      .returning({ id: leads.id });
    await db.insert(leadIdentifiers).values({
      leadId: existing.id,
      kind: "phone",
      valueNormalised: "+919847500401",
      isPrimary: true,
    });

    const body = messagePayload({ from: "919847500401", name: `${MARKER} Known Lead` });
    const req = new Request("https://example.com/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": sign(body, APP_SECRET) },
      body,
    });
    expect((await POST(req)).status).toBe(200);

    const [message] = await db
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.leadId, existing.id));
    expect(message.direction).toBe("inbound");
    expect(message.counsellorId).toBe(COUNSELLOR_ID);
  });

  it("does not create a second lead or message when the same wamid is delivered twice", async () => {
    const messageId = `wamid.${randomUUID()}`;
    const body = messagePayload({ messageId, from: "919847500303", name: `${MARKER} Replay Contact` });
    const makeRequest = () =>
      new Request("https://example.com/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "x-hub-signature-256": sign(body, APP_SECRET) },
        body,
      });

    await POST(makeRequest());
    await POST(makeRequest());

    // No lead is created from this number at all, so the thing to count
    // is the message: one delivery, one row, however many times Meta
    // retries the same wamid.
    const messagesFound = await db
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.fromPhone, "+919847500303"));
    expect(messagesFound).toHaveLength(1);
  });

  it("updates an existing outbound message's status on a delivery-status callback", async () => {
    // An outbound message always belongs to a lead — somebody had to open
    // that lead to send it — so this fixture creates one rather than
    // relying on an inbound message to conjure it.
    const [lead] = await db
      .insert(leads)
      .values({ studentName: `${MARKER} Status Contact`, primaryPhone: "+919847500304" })
      .returning({ id: leads.id });

    const outboundWamid = `wamid.${randomUUID()}`;
    await db.insert(whatsappMessages).values({
      leadId: lead.id,
      direction: "outbound",
      waMessageId: outboundWamid,
      fromPhone: "+911234567890",
      toPhone: "+919847500304",
      status: "sent",
    });

    const statusBody = statusPayload(outboundWamid, "delivered");
    const res = await POST(
      new Request("https://example.com/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "x-hub-signature-256": sign(statusBody, APP_SECRET) },
        body: statusBody,
      }),
    );
    expect(res.status).toBe(200);

    const [updated] = await db.select().from(whatsappMessages).where(eq(whatsappMessages.waMessageId, outboundWamid));
    expect(updated.status).toBe("delivered");
  });
});
