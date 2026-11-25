/**
 * A custom webhook that sends to a database (contact list) instead of leads.
 * Real Postgres, nothing mocked.
 */
import { randomBytes } from "node:crypto";

import { config as loadEnv } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const { POST } = await import("../src/app/api/webhooks/custom/[slug]/route");
const { db } = await import("../src/lib/db/client");
const { contactListMembers, contactLists, contacts, customWebhooks, leads, webhookEvents } = await import(
  "../src/lib/db/schema"
);

const MARKER = "WebhookDbTest";
const token = () => randomBytes(32).toString("hex");
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const post = (slug: string, body: unknown) =>
  POST(
    new Request(`https://example.com/api/webhooks/custom/${slug}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    ctx(slug),
  );

let listId: string;
let archivedListId: string;
let slug: string;
let brokenSlug: string;
const webhookIds: string[] = [];

beforeAll(async () => {
  const [list] = await db.insert(contactLists).values({ name: `${MARKER} list ${token().slice(0, 6)}`, source: "Sheet" }).returning();
  const [archived] = await db
    .insert(contactLists)
    .values({ name: `${MARKER} old ${token().slice(0, 6)}`, source: "Sheet", archivedAt: new Date() })
    .returning();
  listId = list.id;
  archivedListId = archived.id;
  slug = token();
  brokenSlug = token();
  const rows = await db
    .insert(customWebhooks)
    .values([
      { name: `${MARKER} ok`, slug, source: `${MARKER} Sheet`, signingSecret: token(), requireSignature: false, destination: "contact_list", contactListId: listId },
      { name: `${MARKER} broken`, slug: brokenSlug, source: `${MARKER} Sheet`, signingSecret: token(), requireSignature: false, destination: "contact_list", contactListId: archivedListId },
    ])
    .returning({ id: customWebhooks.id });
  webhookIds.push(...rows.map((r) => r.id));
});

afterAll(async () => {
  await db.delete(webhookEvents).where(inArray(webhookEvents.customWebhookId, webhookIds));
  await db.delete(contactListMembers).where(inArray(contactListMembers.listId, [listId, archivedListId]));
  await db.delete(contacts).where(inArray(contacts.phone, ["+919876500111", "+919876500222", "+919876500444", "+919876500555"]));
  await db.delete(contacts).where(eq(contacts.email, "emailonly@webhookdbtest.example"));
  await db.delete(customWebhooks).where(inArray(customWebhooks.id, webhookIds));
  await db.delete(contactLists).where(inArray(contactLists.id, [listId, archivedListId]));
});

describe("custom webhook → database", () => {
  it("adds the person to the chosen list and makes no lead", async () => {
    const res = await post(slug, { name: "Asha Nair", phone: "98765 00111", email: "asha@webhookdbtest.example", city: "Kochi", submission_id: "a1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const [contact] = await db.select().from(contacts).where(eq(contacts.phone, "+919876500111"));
    expect(contact.name).toBe("Asha Nair");
    expect((contact.fields as Record<string, unknown>).city).toBe("Kochi");
    const members = await db.select().from(contactListMembers).where(eq(contactListMembers.listId, listId));
    expect(members.map((m) => m.contactId)).toContain(contact.id);
    const made = await db.select({ id: leads.id }).from(leads).where(eq(leads.primaryPhone, "+919876500111"));
    expect(made).toHaveLength(0);
  });

  it("keeps an https admit-card link on the contact, and ignores a non-https one", async () => {
    await post(slug, { name: "Doc One", phone: "+919876500444", admit_card_url: "https://example.com/a.pdf", submission_id: "d1" });
    await post(slug, { name: "Doc Two", phone: "+919876500555", admit_card_url: "http://example.com/b.pdf", submission_id: "d2" });
    const [one] = await db.select().from(contacts).where(eq(contacts.phone, "+919876500444"));
    const [two] = await db.select().from(contacts).where(eq(contacts.phone, "+919876500555"));
    expect((one.fields as Record<string, unknown>).document_url).toBe("https://example.com/a.pdf");
    expect((two.fields as Record<string, unknown>).document_url).toBeUndefined();
  });

  it("never duplicates a person who comes in twice with different submissions", async () => {
    await post(slug, { name: "Ravi", phone: "+919876500222", submission_id: "r1" });
    const res = await post(slug, { name: "Ravi K", phone: "+919876500222", city: "Kannur", submission_id: "r2" });
    expect(res.status).toBe(200);
    const rows = await db.select().from(contacts).where(eq(contacts.phone, "+919876500222"));
    expect(rows).toHaveLength(1);
    expect((rows[0].fields as Record<string, unknown>).city).toBe("Kannur");
  });

  it("accepts an email with no phone", async () => {
    const res = await post(slug, { name: "Mail Only", email: "emailonly@webhookdbtest.example", submission_id: "e1" });
    expect(await res.json()).toEqual({ ok: true });
    const rows = await db.select().from(contacts).where(eq(contacts.email, "emailonly@webhookdbtest.example"));
    expect(rows).toHaveLength(1);
  });

  it("treats a payload with neither phone nor email as unusable, not a failure to retry", async () => {
    const res = await post(slug, { name: "Nobody", submission_id: "n1" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/phone or email/);
  });

  it("returns 500 and records why when the chosen database is archived", async () => {
    const res = await post(brokenSlug, { name: "Late", phone: "+919876500333", submission_id: "b1" });
    expect(res.status).toBe(500);
    const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.externalId, `${webhookIds[1]}:b1`));
    expect(event.status).toBe("failed");
    expect(event.lastError).toMatch(/archived/);
  });
});
