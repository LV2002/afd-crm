/**
 * Re-labelling an endpoint's past leads, against Postgres.
 *
 *   npm run db:migrate && npm test
 */
import { randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set — see the file header.");

const { db } = await import("../src/lib/db/client");
const { customWebhooks, enquiries, leads, webhookEvents } = await import("../src/lib/db/schema");
const { relabelEndpointLeads } = await import("../src/lib/integrations/custom-webhook/relabel");

const MARKER = "RelabelTest";
let webhookId: string;

async function sweep() {
  const rows = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARKER}%`));
  for (const row of rows) await db.delete(enquiries).where(eq(enquiries.leadId, row.id));
  await db.delete(leads).where(like(leads.studentName, `${MARKER}%`));
  await db.delete(webhookEvents).where(like(webhookEvents.externalId, `${MARKER}%`));
  await db.delete(customWebhooks).where(like(customWebhooks.name, `${MARKER}%`));
}

beforeAll(async () => {
  await sweep();
  const [hook] = await db
    .insert(customWebhooks)
    .values({ name: `${MARKER} hook`, slug: `${MARKER}-${randomUUID()}`, source: "shiksha", signingSecret: "x" })
    .returning({ id: customWebhooks.id });
  webhookId = hook.id;
});

afterAll(sweep);

async function lead(tag: string, firstTouch: string, lastTouch: string, enquirySource: string, viaEndpoint: boolean) {
  const [row] = await db
    .insert(leads)
    .values({
      studentName: `${MARKER} ${tag}`,
      primaryPhone: `+9198470${Math.floor(10000 + Math.random() * 89999)}`,
      firstTouchSource: firstTouch,
      lastTouchSource: lastTouch,
      temperature: "not_contacted",
    })
    .returning({ id: leads.id });
  const externalId = `${MARKER}-${randomUUID()}`;
  await db.insert(enquiries).values({ leadId: row.id, source: enquirySource, dedupeKey: externalId });
  if (viaEndpoint) {
    await db.insert(webhookEvents).values({
      source: "custom",
      externalId,
      signatureOk: true,
      raw: {},
      status: "done",
      customWebhookId: webhookId,
    });
  }
  return row.id;
}

describe("relabelEndpointLeads", () => {
  it("moves this endpoint's leads onto the linked source and leaves everything else alone", async () => {
    const mine = await lead("mine", "Shiksha Webmail", "Shiksha Webmail", "Shiksha Webmail", true);
    const earlier = await lead("earlier", "meta", "Shiksha Webmail", "Shiksha Webmail", true);
    const other = await lead("other", "Shiksha Webmail", "Shiksha Webmail", "Shiksha Webmail", false);

    const changed = await relabelEndpointLeads(webhookId, "shiksha");
    expect(changed).toBe(2);

    const get = async (id: string) => {
      const [l] = await db.select().from(leads).where(eq(leads.id, id));
      const [e] = await db.select().from(enquiries).where(eq(enquiries.leadId, id));
      return { first: l.firstTouchSource, last: l.lastTouchSource, enquiry: e.source };
    };

    expect(await get(mine)).toEqual({ first: "shiksha", last: "shiksha", enquiry: "shiksha" });
    // First touch really was Meta: kept. Latest touch was the old name: moved.
    expect(await get(earlier)).toEqual({ first: "meta", last: "shiksha", enquiry: "shiksha" });
    // Not delivered by this endpoint: untouched, even with the same name.
    expect(await get(other)).toEqual({
      first: "Shiksha Webmail",
      last: "Shiksha Webmail",
      enquiry: "Shiksha Webmail",
    });

    expect(await relabelEndpointLeads(webhookId, "shiksha")).toBe(0);
  });
});
