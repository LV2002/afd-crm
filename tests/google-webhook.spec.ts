/**
 * Integration test for the Google Ads Lead Form webhook route — needs a
 * real database with migrations applied and INTEGRATION_ENCRYPTION_KEY set
 * (same DATABASE_URL as the other integration suites):
 *
 *   npm run db:migrate && npm test
 *
 * Unlike Meta's webhook, there is no external network call to mock here —
 * Google's Lead Form webhook delivers the full lead payload inline, so
 * every assertion below runs the real code path (google_key verification,
 * webhook_events persistence, resolveOrCreateLead()) against Postgres.
 */
import { randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — see the file header for how to run this suite.");
}
if (!process.env.INTEGRATION_ENCRYPTION_KEY) {
  throw new Error("INTEGRATION_ENCRYPTION_KEY is not set — see .env.local.");
}

const { POST } = await import("../src/app/api/webhooks/google-leads/route");
const { db } = await import("../src/lib/db/client");
const { leadIdentifiers, leads, webhookEvents } = await import("../src/lib/db/schema");
const { setIntegrationCredential, deleteIntegrationCredential } = await import("../src/lib/integrations/credentials");

const GOOGLE_KEY = "test-google-key";
const MARKER = "GoogleWebhookTest";

function leadPayload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    api_version: "1.0",
    lead_id: randomUUID(),
    campaign_id: 111,
    form_id: 222,
    adgroup_id: 333,
    creative_id: 444,
    gcl_id: "gclid-test",
    google_key: GOOGLE_KEY,
    is_test: false,
    user_column_data: [
      { column_id: "FULL_NAME", column_name: "Full Name", string_value: `${MARKER} Lead` },
      { column_id: "PHONE_NUMBER", column_name: "Phone", string_value: "+919847500201" },
      { column_id: "EMAIL", column_name: "Email", string_value: "test@example.com" },
    ],
    ...overrides,
  });
}

async function sweep() {
  await db.delete(leads).where(like(leads.studentName, `${MARKER}%`));
  await db.delete(webhookEvents).where(eq(webhookEvents.source, "google_leads"));
}

beforeAll(async () => {
  await sweep();
  await setIntegrationCredential("google", "google_key", GOOGLE_KEY);
});

afterAll(async () => {
  await sweep();
  await deleteIntegrationCredential("google", "google_key");
});

describe("POST /api/webhooks/google-leads", () => {
  it("rejects a request with a wrong google_key and logs it", async () => {
    const body = leadPayload({ google_key: "wrong-key" });
    const req = new Request("https://example.com/api/webhooks/google-leads", { method: "POST", body });
    const res = await POST(req);
    expect(res.status).toBe(401);

    const [row] = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.source, "google_leads"))
      .orderBy(webhookEvents.receivedAt);
    expect(row.signatureOk).toBe(false);
    expect(row.status).toBe("failed");
  });

  it("rejects a request with a malformed JSON body", async () => {
    const req = new Request("https://example.com/api/webhooks/google-leads", { method: "POST", body: "not json" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("processes a validly-keyed lead into a real lead row", async () => {
    const body = leadPayload();
    const req = new Request("https://example.com/api/webhooks/google-leads", { method: "POST", body });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const [lead] = await db.select().from(leads).where(eq(leads.studentName, `${MARKER} Lead`));
    expect(lead).toBeDefined();
    expect(lead.firstTouchSource).toBe("google");
    expect(lead.firstTouchCampaign).toBe("111");

    const [identifier] = await db.select().from(leadIdentifiers).where(eq(leadIdentifiers.leadId, lead.id));
    expect(identifier.valueNormalised).toBe("+919847500201");

    const parsed = JSON.parse(body);
    const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.externalId, parsed.lead_id));
    expect(event.status).toBe("done");
    expect(event.signatureOk).toBe(true);
  });

  it("does not create a second lead when the same lead_id is delivered twice", async () => {
    const leadId = randomUUID();
    const body = leadPayload({
      lead_id: leadId,
      user_column_data: [
        { column_id: "FULL_NAME", string_value: `${MARKER} Replay` },
        { column_id: "PHONE_NUMBER", string_value: "+919847500202" },
      ],
    });

    await POST(new Request("https://example.com/api/webhooks/google-leads", { method: "POST", body }));
    await POST(new Request("https://example.com/api/webhooks/google-leads", { method: "POST", body }));

    const rows = await db.select().from(leads).where(eq(leads.studentName, `${MARKER} Replay`));
    expect(rows).toHaveLength(1);
  });

  it("persists and marks done a test lead (is_test: true) without creating a real lead", async () => {
    const body = leadPayload({
      is_test: true,
      user_column_data: [
        { column_id: "FULL_NAME", string_value: `${MARKER} ShouldNotExist` },
        { column_id: "PHONE_NUMBER", string_value: "+919847500203" },
      ],
    });
    const res = await POST(new Request("https://example.com/api/webhooks/google-leads", { method: "POST", body }));
    expect(res.status).toBe(200);
    expect((await res.json()).test).toBe(true);

    const rows = await db.select().from(leads).where(eq(leads.studentName, `${MARKER} ShouldNotExist`));
    expect(rows).toHaveLength(0);

    const parsed = JSON.parse(body);
    const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.externalId, parsed.lead_id));
    expect(event.status).toBe("done");
  });

  it("marks the event failed and returns 500 when the phone can't be normalised", async () => {
    const body = leadPayload({
      user_column_data: [
        { column_id: "FULL_NAME", string_value: `${MARKER} BadPhone` },
        { column_id: "PHONE_NUMBER", string_value: "12345" },
      ],
    });
    const res = await POST(new Request("https://example.com/api/webhooks/google-leads", { method: "POST", body }));
    expect(res.status).toBe(500);

    const parsed = JSON.parse(body);
    const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.externalId, parsed.lead_id));
    expect(event.status).toBe("failed");
    expect(event.lastError).toMatch(/could not normalise/i);
  });
});
