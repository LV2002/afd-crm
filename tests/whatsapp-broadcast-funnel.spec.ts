/** Delivered / read / replied are recorded on the broadcast recipient. */
import { config as loadEnv } from "dotenv";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

vi.mock("server-only", () => ({}));

const { db } = await import("../src/lib/db/client");
const { leads, whatsappBroadcastRecipients, whatsappBroadcasts } = await import("../src/lib/db/schema");
const { applyBroadcastStatus, markBroadcastReply } = await import("../src/lib/whatsapp/broadcast-tracking");
const { pct } = await import("../src/lib/whatsapp/broadcast-funnel");

const MARKER = "BroadcastFunnelTest";
let broadcastId = "";
let recipientId = "";

async function cleanup() {
  await db.delete(whatsappBroadcasts).where(sql`${whatsappBroadcasts.name} like ${MARKER + "%"}`);
  await db.delete(leads).where(sql`${leads.studentName} like ${MARKER + "%"}`);
}

beforeAll(async () => {
  await cleanup();
  const [lead] = await db.insert(leads).values({ studentName: `${MARKER} A`, primaryPhone: "+919847720001" }).returning({ id: leads.id });
  const [b] = await db.insert(whatsappBroadcasts).values({ name: `${MARKER} 1`, templateName: "t" }).returning({ id: whatsappBroadcasts.id });
  broadcastId = b.id;
  const [r] = await db
    .insert(whatsappBroadcastRecipients)
    .values({ broadcastId, leadId: lead.id, phone: "+919847720001", status: "sent", waMessageId: "wamid.funnel1", sentAt: new Date() })
    .returning({ id: whatsappBroadcastRecipients.id });
  recipientId = r.id;
});
afterAll(cleanup);

describe("broadcast funnel", () => {
  it("records delivered, then read (which also implies delivered)", async () => {
    await applyBroadcastStatus("wamid.funnel1", "delivered");
    let [row] = await db.select().from(whatsappBroadcastRecipients).where(eq(whatsappBroadcastRecipients.id, recipientId));
    expect(row.deliveredAt).not.toBeNull();
    expect(row.readAt).toBeNull();
    await applyBroadcastStatus("wamid.funnel1", "read");
    [row] = await db.select().from(whatsappBroadcastRecipients).where(eq(whatsappBroadcastRecipients.id, recipientId));
    expect(row.readAt).not.toBeNull();
  });
  it("marks a reply from that number once", async () => {
    await markBroadcastReply("919847720001");
    const [row] = await db.select().from(whatsappBroadcastRecipients).where(eq(whatsappBroadcastRecipients.id, recipientId));
    expect(row.repliedAt).not.toBeNull();
  });
  it("percent handles zero", () => {
    expect(pct(1, 0)).toBe(0);
    expect(pct(1, 3)).toBe(33);
  });
});
