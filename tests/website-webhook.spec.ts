/**
 * The website form webhook, end to end against Postgres.
 *
 * AFD's site posts its enquiry forms to a Google Apps Script. That script
 * now also calls this route, so an enquiry becomes an owned lead with a
 * response-time clock instead of a spreadsheet row.
 *
 *   npm run db:migrate && npm test
 *
 * Nothing is mocked: signature verification, webhook_events persistence
 * and resolveOrCreateLead() all run for real.
 */
import { createHmac, randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set — see the file header.");
if (!process.env.INTEGRATION_ENCRYPTION_KEY) throw new Error("INTEGRATION_ENCRYPTION_KEY is not set.");

const { POST } = await import("../src/app/api/webhooks/website/route");
const { db } = await import("../src/lib/db/client");
const { leadIdentifiers, leads, webhookEvents } = await import("../src/lib/db/schema");
const { setIntegrationCredential, deleteIntegrationCredential } = await import(
  "../src/lib/integrations/credentials"
);

const SECRET = "test-website-signing-secret";
const MARKER = "WebsiteWebhookTest";

/** Exactly what the Apps Script does: HMAC the body, send it as sha256=<hex>. */
function request(body: string, secret: string = SECRET): Request {
  const hex = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  return new Request("https://example.com/api/webhooks/website", {
    method: "POST",
    headers: { "content-type": "application/json", "x-afd-signature": `sha256=${hex}` },
    body,
  });
}

/**
 * A distinct person each time. The email has to vary along with the
 * phone: `resolveOrCreateLead()` matches on phone first and email second,
 * so two submissions sharing one address are one human being as far as
 * the CRM is concerned — correctly — and a fixture that reused
 * `anjali@example.invalid` was quietly testing that instead.
 */
function submission(over: Record<string, unknown> = {}) {
  const who = randomUUID().slice(0, 8);
  return JSON.stringify({
    submission_id: randomUUID(),
    name: `${MARKER} Anjali`,
    phone: `98470${Math.floor(10000 + Math.random() * 89999)}`,
    email: `anjali-${who}@example.invalid`,
    city: "Kochi",
    course: "NIFT UG",
    form: "Homepage enquiry",
    ...over,
  });
}

beforeAll(async () => {
  await setIntegrationCredential("website", "signing_secret", SECRET);
});

afterAll(async () => {
  const made = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARKER}%`));
  for (const lead of made) {
    await db.delete(leadIdentifiers).where(eq(leadIdentifiers.leadId, lead.id));
    await db.delete(leads).where(eq(leads.id, lead.id));
  }
  await db.delete(webhookEvents).where(eq(webhookEvents.source, "website"));
  await deleteIntegrationCredential("website", "signing_secret");
});

describe("signature", () => {
  it("refuses a body signed with the wrong secret", async () => {
    const response = await POST(request(submission(), "not-the-secret"));
    expect(response.status).toBe(401);
  });

  it("refuses a body with no signature at all", async () => {
    const response = await POST(
      new Request("https://example.com/api/webhooks/website", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: submission(),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("records the rejected attempt rather than dropping it", async () => {
    // A bad signature is forensic evidence — somebody found the URL.
    await POST(request(submission(), "not-the-secret"));
    const rows = await db
      .select({ signatureOk: webhookEvents.signatureOk, lastError: webhookEvents.lastError })
      .from(webhookEvents)
      .where(eq(webhookEvents.source, "website"));
    const rejected = rows.filter((row) => !row.signatureOk);
    expect(rejected.length).toBeGreaterThan(0);
    expect(rejected[0].lastError).toContain("Signature");
  });

  it("refuses a correctly signed body that is not JSON", async () => {
    const response = await POST(request("this is not json"));
    expect(response.status).toBe(400);
  });
});

describe("a real submission", () => {
  it("becomes a lead with Website as its source", async () => {
    const body = submission();
    const response = await POST(request(body));
    expect(response.status).toBe(200);

    const { phone } = JSON.parse(body) as { phone: string };
    const [lead] = await db
      .select({
        name: leads.studentName,
        source: leads.firstTouchSource,
        subSource: leads.firstTouchSubSource,
        city: leads.city,
      })
      .from(leads)
      .where(eq(leads.primaryPhone, `+91${phone}`));

    expect(lead).toBeTruthy();
    expect(lead.source).toBe("Website");
    expect(lead.subSource).toBe("Homepage enquiry");
    expect(lead.city).toBe("Kochi");
  });

  it("does not create a second lead when the script retries", async () => {
    // Apps Script retries on a non-2xx, and UrlFetchApp can fire twice on
    // a slow response. The same submission id must stay one lead.
    const body = submission();
    await POST(request(body));
    const second = await POST(request(body));

    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ duplicate: true });

    const { phone } = JSON.parse(body) as { phone: string };
    const rows = await db.select({ id: leads.id }).from(leads).where(eq(leads.primaryPhone, `+91${phone}`));
    expect(rows).toHaveLength(1);
  });

  it("attaches a second enquiry to the person who already enquired", async () => {
    // Non-negotiable #2: never reject a duplicate. Somebody who filled in
    // the homepage form last month and the NIFT page today is one lead
    // with two enquiries, not two leads competing for one counsellor.
    const first = submission();
    await POST(request(first));

    const { email } = JSON.parse(first) as { email: string };
    const again = submission({ email, form: "NIFT page enquiry" });
    const response = await POST(request(again));
    expect(response.status).toBe(200);

    const rows = await db
      .select({ id: leads.id, subSource: leads.firstTouchSubSource })
      .from(leads)
      .where(eq(leads.email, email));
    expect(rows).toHaveLength(1);
    // First-touch source is never overwritten by a later enquiry.
    expect(rows[0].subSource).toBe("Homepage enquiry");
  });

  it("accepts a submission that is unusable, and does not ask for it again", async () => {
    // No phone. Retrying produces the same result, so a 200 with the
    // reason recorded beats a 500 the script keeps re-sending.
    const body = JSON.stringify({ submission_id: randomUUID(), name: `${MARKER} No Phone` });
    const response = await POST(request(body));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: false });

    const { submission_id } = JSON.parse(body) as { submission_id: string };
    const [event] = await db
      .select({ status: webhookEvents.status, lastError: webhookEvents.lastError })
      .from(webhookEvents)
      .where(eq(webhookEvents.externalId, submission_id));
    expect(event.status).toBe("failed");
    expect(event.lastError).toContain("phone");
  });

  it("keeps the unrecognised fields on the raw payload", async () => {
    const body = submission({ "How did you hear about us": "My cousin" });
    await POST(request(body));

    const { submission_id } = JSON.parse(body) as { submission_id: string };
    const [event] = await db
      .select({ raw: webhookEvents.raw })
      .from(webhookEvents)
      .where(eq(webhookEvents.externalId, submission_id));
    expect((event.raw as Record<string, unknown>)["How did you hear about us"]).toBe("My cousin");
  });
});
