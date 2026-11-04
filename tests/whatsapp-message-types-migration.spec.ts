/**
 * The repair in migration 0114, against a real database: a stored delivery
 * that the old mapper turned into an empty message is fixed from the raw
 * payload. Needs migrations applied (see confirm-admission.spec.ts).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { config as loadEnv } from "dotenv";
import { eq, like, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const { db } = await import("../src/lib/db/client");
const { webhookEvents, whatsappMessages } = await import("../src/lib/db/schema");

const MARK = "wamid.MIGTEST";
const FILE = readFileSync(
  join(__dirname, "..", "src", "lib", "db", "migrations", "0114_whatsapp_message_types.sql"),
  "utf8",
);

async function plant(id: string, raw: Record<string, unknown>, over: Record<string, unknown> = {}) {
  await db.insert(webhookEvents).values({ source: "whatsapp", externalId: `msg:${MARK}${id}`, signatureOk: true, raw });
  const [row] = await db
    .insert(whatsappMessages)
    .values({
      direction: "inbound",
      waMessageId: `${MARK}${id}`,
      fromPhone: "+919847100100",
      toPhone: "+919995484649",
      messageType: "text",
      body: null,
      status: "received",
      ...over,
    })
    .returning({ id: whatsappMessages.id });
  return row.id;
}

async function sweep() {
  await db.delete(whatsappMessages).where(like(whatsappMessages.waMessageId, `${MARK}%`));
  await db.delete(webhookEvents).where(like(webhookEvents.externalId, `msg:${MARK}%`));
}

beforeAll(sweep);
afterAll(sweep);

describe("0114 repairs empty messages from the raw delivery", () => {
  it("hides reactions, labels the rest, and restores captions", async () => {
    const reaction = await plant("r", { id: `${MARK}r`, type: "reaction", reaction: { emoji: "👍" } });
    const unsupported = await plant("u", { id: `${MARK}u`, type: "unsupported" });
    const location = await plant("l", { id: `${MARK}l`, type: "location", location: { name: "AFD Kochi", latitude: 9.9, longitude: 76.2 } });
    const other = await plant("o", { id: `${MARK}o`, type: "order" });
    const photo = await plant("p", { id: `${MARK}p`, type: "image", image: { id: "m", caption: "My marksheet" } }, { messageType: "media", mediaId: "m" });
    const text = await plant("t", { id: `${MARK}t`, type: "text", text: { body: "Hi" } }, { body: "Hi" });

    for (const statement of FILE.split("--> statement-breakpoint")) {
      if (statement.trim()) await db.execute(sql.raw(statement));
    }

    const get = async (id: string) => (await db.select().from(whatsappMessages).where(eq(whatsappMessages.id, id)))[0];
    expect((await get(reaction)).deletedAt).not.toBeNull();
    expect((await get(unsupported)).deletedAt).not.toBeNull();
    expect((await get(location)).body).toBe("📍 Location: AFD Kochi (9.9, 76.2)");
    expect((await get(other)).body).toBe("[order message]");
    expect((await get(photo)).body).toBe("My marksheet");
    expect((await get(text)).body).toBe("Hi");
    expect((await get(text)).deletedAt).toBeNull();
  });
});
