/**
 * Integration test for the Meta Lead Ads webhook route — needs a real
 * database with migrations applied (same DATABASE_URL as the other
 * integration suites) and INTEGRATION_ENCRYPTION_KEY set (see .env.local):
 *
 *   npm run db:migrate && npm test
 *
 * Mocks only the one real network call (`fetchMetaLead`, the Graph API
 * lookup) — everything else (signature verification, webhook_events
 * persistence, resolveOrCreateLead()) runs for real against Postgres, the
 * same "exercise the actual code path" standard as every other
 * integration suite in this repo.
 */
import { createHmac, randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — see the file header for how to run this suite.");
}
if (!process.env.INTEGRATION_ENCRYPTION_KEY) {
  throw new Error("INTEGRATION_ENCRYPTION_KEY is not set — see .env.local.");
}

vi.mock("../src/lib/integrations/meta/graph-client", () => ({
  fetchMetaLead: vi.fn(),
}));

const { fetchMetaLead } = await import("../src/lib/integrations/meta/graph-client");
const { GET, POST } = await import("../src/app/api/webhooks/meta-leads/route");
const { db } = await import("../src/lib/db/client");
const { leadIdentifiers, leads, webhookEvents } = await import("../src/lib/db/schema");
const { setIntegrationCredential, deleteIntegrationCredential } = await import("../src/lib/integrations/credentials");

const APP_SECRET = "test-app-secret";
const VERIFY_TOKEN = "test-verify-token";
const MARKER = "MetaWebhookTest";

function sign(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

function leadgenPayload(leadgenId: string) {
  return JSON.stringify({
    object: "page",
    entry: [{ id: "page123", time: Date.now(), changes: [{ field: "leadgen", value: { leadgen_id: leadgenId } }] }],
  });
}

async function sweep() {
  await db.delete(leads).where(like(leads.studentName, `${MARKER}%`));
  await db.delete(webhookEvents).where(eq(webhookEvents.source, "meta_leads"));
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
  vi.mocked(fetchMetaLead).mockReset();
});

describe("GET /api/webhooks/meta-leads (verification handshake)", () => {
  it("echoes the challenge when the verify token matches", async () => {
    const req = new Request(
      `https://example.com/api/webhooks/meta-leads?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=echo123`,
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("echo123");
  });

  it("rejects a wrong verify token", async () => {
    const req = new Request(
      "https://example.com/api/webhooks/meta-leads?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=echo123",
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/webhooks/meta-leads (lead ingestion)", () => {
  it("rejects a request with an invalid signature and logs it", async () => {
    const body = leadgenPayload(randomUUID());
    const req = new Request("https://example.com/api/webhooks/meta-leads", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=deadbeef" },
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);

    const [row] = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.source, "meta_leads"))
      .orderBy(webhookEvents.receivedAt);
    expect(row.signatureOk).toBe(false);
    expect(row.status).toBe("failed");
  });

  it("processes a validly-signed lead into a real lead row", async () => {
    const leadgenId = randomUUID();
    vi.mocked(fetchMetaLead).mockResolvedValue({
      id: leadgenId,
      form_id: "form1",
      ad_id: "ad1",
      adset_id: "adset1",
      campaign_id: "campaign1",
      field_data: [
        { name: "full_name", values: [`${MARKER} Lead`] },
        { name: "phone_number", values: ["+919847500101"] },
        { name: "email", values: ["test@example.com"] },
      ],
    });

    const body = leadgenPayload(leadgenId);
    const req = new Request("https://example.com/api/webhooks/meta-leads", {
      method: "POST",
      headers: { "x-hub-signature-256": sign(body, APP_SECRET) },
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const [lead] = await db.select().from(leads).where(eq(leads.studentName, `${MARKER} Lead`));
    expect(lead).toBeDefined();
    expect(lead.firstTouchSource).toBe("meta");
    expect(lead.firstTouchCampaign).toBe("campaign1");

    const [identifier] = await db.select().from(leadIdentifiers).where(eq(leadIdentifiers.leadId, lead.id));
    expect(identifier.valueNormalised).toBe("+919847500101");

    const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.externalId, leadgenId));
    expect(event.status).toBe("done");
    expect(event.signatureOk).toBe(true);
  });

  it("does not create a second lead when the same leadgen_id is delivered twice", async () => {
    const leadgenId = randomUUID();
    vi.mocked(fetchMetaLead).mockResolvedValue({
      id: leadgenId,
      field_data: [
        { name: "full_name", values: [`${MARKER} Replay`] },
        { name: "phone_number", values: ["+919847500102"] },
      ],
    });

    const body = leadgenPayload(leadgenId);
    const makeRequest = () =>
      new Request("https://example.com/api/webhooks/meta-leads", {
        method: "POST",
        headers: { "x-hub-signature-256": sign(body, APP_SECRET) },
        body,
      });

    await POST(makeRequest());
    await POST(makeRequest());

    expect(fetchMetaLead).toHaveBeenCalledTimes(1); // second delivery short-circuited before ever calling Graph API

    const rows = await db.select().from(leads).where(eq(leads.studentName, `${MARKER} Replay`));
    expect(rows).toHaveLength(1);
  });

  it("marks the event failed and returns 500 when the Graph API lookup fails", async () => {
    const leadgenId = randomUUID();
    vi.mocked(fetchMetaLead).mockRejectedValue(new Error("Graph API is down"));

    const body = leadgenPayload(leadgenId);
    const req = new Request("https://example.com/api/webhooks/meta-leads", {
      method: "POST",
      headers: { "x-hub-signature-256": sign(body, APP_SECRET) },
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(500);

    const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.externalId, leadgenId));
    expect(event.status).toBe("failed");
    expect(event.lastError).toMatch(/Graph API is down/);
  });
});
