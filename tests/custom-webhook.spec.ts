/**
 * Custom webhook endpoints, end to end against Postgres.
 *
 *   npm run db:migrate && npm test
 *
 * Nothing is mocked: the slug lookup, signature verification,
 * `webhook_events` persistence and `resolveOrCreateLead()` all run for
 * real. What is being tested is the thing that makes this feature safe to
 * hand an admin — that an endpoint they created behaves exactly like a
 * built-in one, including refusing what a built-in one refuses.
 */
import { createHmac, randomBytes } from "node:crypto";

import { config as loadEnv } from "dotenv";
import { and, eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set — see the file header.");

const { POST, GET } = await import("../src/app/api/webhooks/custom/[slug]/route");
const { db } = await import("../src/lib/db/client");
const { centers, customWebhooks, enquiries, leadIdentifiers, leads, webhookEvents } = await import(
  "../src/lib/db/schema"
);

const MARKER = "CustomWebhookTest";
const SOURCE = `${MARKER} Knorish`;

let signedId: string;
let signedSlug: string;
let signedSecret: string;
let openId: string;
let openSlug: string;
let keyedId: string;
let keyedSlug: string;
let keyedKey: string;
let centerId: string;

function token(): string {
  return randomBytes(32).toString("hex");
}

function request(slug: string, body: string, secret?: string, extraHeaders?: Record<string, string>): Request {
  const headers: Record<string, string> = { "content-type": "application/json", ...extraHeaders };
  if (secret) {
    headers["x-afd-signature"] = `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
  }
  return new Request(`https://example.com/api/webhooks/custom/${slug}`, {
    method: "POST",
    headers,
    body,
  });
}

function context(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

async function sweep() {
  const testLeads = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARKER}%`));
  for (const lead of testLeads) {
    await db.delete(enquiries).where(eq(enquiries.leadId, lead.id));
    await db.delete(leadIdentifiers).where(eq(leadIdentifiers.leadId, lead.id));
  }
  await db.delete(leads).where(like(leads.studentName, `${MARKER}%`));

  const hooks = await db.select({ id: customWebhooks.id }).from(customWebhooks).where(like(customWebhooks.name, `${MARKER}%`));
  for (const hook of hooks) {
    await db.delete(webhookEvents).where(eq(webhookEvents.customWebhookId, hook.id));
  }
  await db.delete(customWebhooks).where(like(customWebhooks.name, `${MARKER}%`));
  await db.delete(centers).where(like(centers.name, `${MARKER}%`));
}

beforeAll(async () => {
  await sweep();

  const [center] = await db
    .insert(centers)
    .values({ name: `${MARKER} centre`, city: "Kochi" })
    .returning({ id: centers.id });
  centerId = center.id;

  signedSlug = token();
  signedSecret = token();
  const [signed] = await db
    .insert(customWebhooks)
    .values({
      name: `${MARKER} signed`,
      slug: signedSlug,
      source: SOURCE,
      subSource: "Foundation course page",
      centerId,
      signingSecret: signedSecret,
      requireSignature: true,
    })
    .returning({ id: customWebhooks.id });
  signedId = signed.id;

  openSlug = token();
  const [open] = await db
    .insert(customWebhooks)
    .values({
      name: `${MARKER} open`,
      slug: openSlug,
      source: `${MARKER} Google Form`,
      signingSecret: token(),
      requireSignature: false,
      fieldAliases: { name: ["buyer"], phone: ["mob"] },
    })
    .returning({ id: customWebhooks.id });
  openId = open.id;

  // The shape this exists for: a sender that cannot sign a request but
  // can set one header. Signature off, key on.
  keyedSlug = token();
  keyedKey = token();
  const [keyed] = await db
    .insert(customWebhooks)
    .values({
      name: `${MARKER} keyed`,
      slug: keyedSlug,
      source: `${MARKER} Course platform`,
      signingSecret: token(),
      requireSignature: false,
      authToken: keyedKey,
    })
    .returning({ id: customWebhooks.id });
  keyedId = keyed.id;
});

afterAll(async () => {
  await sweep();
});

async function leadByPhone(phone: string) {
  const [row] = await db.select().from(leads).where(eq(leads.primaryPhone, phone));
  return row;
}

describe("an unknown endpoint", () => {
  it("is a 404 and writes nothing", async () => {
    const before = await db.select({ id: webhookEvents.id }).from(webhookEvents).where(eq(webhookEvents.source, "custom"));

    const response = await POST(request("not-a-real-slug", "{}"), context("not-a-real-slug"));
    expect(response.status).toBe(404);

    // Recording unknown tokens would let anybody with the URL shape fill
    // a table that holds raw payloads and is read by admins.
    const after = await db.select({ id: webhookEvents.id }).from(webhookEvents).where(eq(webhookEvents.source, "custom"));
    expect(after.length).toBe(before.length);
  });

  it("is a 404 for an endpoint that was switched off", async () => {
    await db.update(customWebhooks).set({ isActive: false }).where(eq(customWebhooks.id, openId));

    const body = JSON.stringify({ buyer: "x", mob: "9847099001" });
    const response = await POST(request(openSlug, body), context(openSlug));
    expect(response.status).toBe(404);

    await db.update(customWebhooks).set({ isActive: true }).where(eq(customWebhooks.id, openId));
  });
});

describe("a signed endpoint", () => {
  it("creates a lead with the admin's own source name", async () => {
    const phone = "9847099101";
    const body = JSON.stringify({
      name: `${MARKER} Aarav`,
      phone,
      email: "aarav@example.com",
      order_id: "KN-1001",
    });

    const response = await POST(request(signedSlug, body, signedSecret), context(signedSlug));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });

    const lead = await leadByPhone(`+91${phone}`);
    expect(lead).toBeTruthy();
    expect(lead.studentName).toBe(`${MARKER} Aarav`);
    // First-touch source on the lead, and the source on the enquiry:
    // the same value, which is what makes the sources report able to
    // tell this feed from another.
    expect(lead.firstTouchSource).toBe(SOURCE);
    // The endpoint's centre, stamped because the payload carried none.
    expect(lead.centerId).toBe(centerId);

    const [enquiry] = await db.select().from(enquiries).where(eq(enquiries.leadId, lead.id));
    expect(enquiry.source).toBe(SOURCE);
    expect(enquiry.subSource).toBe("Foundation course page");
  });

  it("marks the delivery done, with the endpoint on it", async () => {
    const [event] = await db
      .select()
      .from(webhookEvents)
      .where(and(eq(webhookEvents.customWebhookId, signedId), eq(webhookEvents.status, "done")));

    expect(event.signatureOk).toBe(true);
    expect(event.externalId).toBe(`${signedId}:KN-1001`);
    expect(event.processedAt).not.toBeNull();
  });

  it("refuses an unsigned request, and keeps the payload as evidence", async () => {
    const body = JSON.stringify({ name: `${MARKER} Nobody`, phone: "9847099102" });

    const response = await POST(request(signedSlug, body), context(signedSlug));
    expect(response.status).toBe(401);

    expect(await leadByPhone("+919847099102")).toBeUndefined();

    const [event] = await db
      .select()
      .from(webhookEvents)
      .where(and(eq(webhookEvents.customWebhookId, signedId), eq(webhookEvents.signatureOk, false)));
    expect(event.status).toBe("failed");
    expect(event.lastError).toMatch(/signature/i);
  });

  it("refuses a request signed with the wrong secret", async () => {
    const body = JSON.stringify({ name: `${MARKER} Wrong`, phone: "9847099103" });
    const response = await POST(request(signedSlug, body, token()), context(signedSlug));

    expect(response.status).toBe(401);
    expect(await leadByPhone("+919847099103")).toBeUndefined();
  });

  it("does not create a second lead when a delivery is retried", async () => {
    const phone = "9847099104";
    const body = JSON.stringify({ name: `${MARKER} Retry`, phone, order_id: "KN-1002" });

    await POST(request(signedSlug, body, signedSecret), context(signedSlug));
    const second = await POST(request(signedSlug, body, signedSecret), context(signedSlug));

    await expect(second.json()).resolves.toMatchObject({ duplicate: true });

    const rows = await db.select({ id: leads.id }).from(leads).where(eq(leads.primaryPhone, `+91${phone}`));
    expect(rows).toHaveLength(1);
  });
});

describe("an endpoint with signing switched off", () => {
  it("accepts an unsigned request", async () => {
    const phone = "9847099201";
    const body = JSON.stringify({ buyer: `${MARKER} Rahul`, mob: phone, order_id: "GF-1" });

    const response = await POST(request(openSlug, body), context(openSlug));
    expect(response.status).toBe(200);

    const lead = await leadByPhone(`+91${phone}`);
    // Mapped only because the endpoint carries the extra aliases: neither
    // `buyer` nor `mob` is in the built-in list.
    expect(lead.studentName).toBe(`${MARKER} Rahul`);
    expect(lead.firstTouchSource).toBe(`${MARKER} Google Form`);
  });

  it("leaves the centre to the assignment rules when the endpoint names none", async () => {
    const lead = await leadByPhone("+919847099201");
    expect(lead.centerId).toBeNull();
  });
});

describe("a payload that cannot become a lead", () => {
  it("is recorded as failed and answered 200, because retrying will not help", async () => {
    const body = JSON.stringify({ something: "else", order_id: "GF-2" });

    const response = await POST(request(openSlug, body), context(openSlug));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: false });

    const [event] = await db
      .select()
      .from(webhookEvents)
      .where(and(eq(webhookEvents.customWebhookId, openId), eq(webhookEvents.externalId, `${openId}:GF-2`)));
    expect(event.status).toBe("failed");
    // The reason names what the sender actually called things, which is
    // what somebody setting up a feed needs to read.
    expect(event.lastError).toContain("something");
  });

  it("refuses a body that is not a JSON object", async () => {
    const response = await POST(request(openSlug, "[1,2,3]"), context(openSlug));
    expect(response.status).toBe(400);

    const [event] = await db
      .select()
      .from(webhookEvents)
      .where(and(eq(webhookEvents.customWebhookId, openId), eq(webhookEvents.status, "failed")));
    expect(event).toBeTruthy();
  });
});

describe("the GET probe", () => {
  it("says the endpoint is live without revealing anything", async () => {
    const response = await GET(new Request("https://example.com"), context(signedSlug));
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.endpoint).toBe(`${MARKER} signed`);
    expect(JSON.stringify(body)).not.toContain(signedSecret);
    expect(JSON.stringify(body)).not.toContain(signedSlug);
  });

  it("is a 404 for an unknown token", async () => {
    const response = await GET(new Request("https://example.com"), context("nope"));
    expect(response.status).toBe(404);
  });
});

describe("an endpoint with an authentication key", () => {
  async function failuresFor(id: string) {
    return db
      .select({ lastError: webhookEvents.lastError })
      .from(webhookEvents)
      .where(and(eq(webhookEvents.customWebhookId, id), eq(webhookEvents.status, "failed")));
  }

  it("refuses a request that carries no key, and records why", async () => {
    const before = await failuresFor(keyedId);
    const body = JSON.stringify({ name: `${MARKER} NoKey`, phone: "9847099301" });

    const response = await POST(request(keyedSlug, body), context(keyedSlug));
    expect(response.status).toBe(401);

    // Refused deliveries are kept: while somebody is wiring a new sender
    // up, the list of what was rejected and why is the only thing on
    // screen that tells them which box they filled in wrong.
    const after = await failuresFor(keyedId);
    expect(after.length).toBe(before.length + 1);
    expect(after[after.length - 1].lastError).toContain("authentication key");

    expect(await leadByPhone("+919847099301")).toBeUndefined();
  });

  it("refuses a wrong key", async () => {
    const body = JSON.stringify({ name: `${MARKER} WrongKey`, phone: "9847099302" });
    const response = await POST(
      request(keyedSlug, body, undefined, { authorization: `Bearer ${token()}` }),
      context(keyedSlug),
    );

    expect(response.status).toBe(401);
    expect(await leadByPhone("+919847099302")).toBeUndefined();
  });

  it("accepts a bearer token", async () => {
    const body = JSON.stringify({ name: `${MARKER} Bearer`, phone: "9847099303" });
    const response = await POST(
      request(keyedSlug, body, undefined, { authorization: `Bearer ${keyedKey}` }),
      context(keyedSlug),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const lead = await leadByPhone("+919847099303");
    expect(lead).toBeDefined();
    // The whole point of the feature: the admin's own source name, kept
    // as first touch so the sources report can tell one feed from another.
    expect(lead.firstTouchSource).toBe(`${MARKER} Course platform`);
  });

  it("accepts the key in X-AFD-Key, for a sender that cannot set Authorization", async () => {
    const body = JSON.stringify({ name: `${MARKER} XKey`, phone: "9847099304" });
    const response = await POST(
      request(keyedSlug, body, undefined, { "x-afd-key": keyedKey }),
      context(keyedSlug),
    );

    expect(response.status).toBe(200);
    expect(await leadByPhone("+919847099304")).toBeDefined();
  });

  /*
    The regression that would make this feature a liability rather than a
    safeguard: a key configured on one endpoint must not let anything
    through on an endpoint that has none, and an endpoint with no key must
    go on working exactly as it did before this column existed.
  */
  it("leaves an endpoint without a key alone", async () => {
    const body = JSON.stringify({ buyer: `${MARKER} NoKeyNeeded`, mob: "9847099305" });

    const response = await POST(request(openSlug, body), context(openSlug));
    expect(response.status).toBe(200);
    expect(await leadByPhone("+919847099305")).toBeDefined();
  });

  it("says a key is expected without ever naming it", async () => {
    const response = await GET(request(keyedSlug, ""), context(keyedSlug));
    const probe = (await response.json()) as { expects: string };

    expect(probe.expects).toContain("authentication key");
    // This reply is reachable by anybody holding the URL — which, on an
    // unsigned endpoint, is exactly who the key exists to keep out.
    expect(JSON.stringify(probe)).not.toContain(keyedKey);
  });
});
