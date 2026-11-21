/** The overdue-reply sweep against a real database: alerts once, respects resolved. */
import { config as loadEnv } from "dotenv";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/notifications/notify", () => ({ notify: vi.fn() }));

const { notify } = await import("../src/lib/notifications/notify");
const { db } = await import("../src/lib/db/client");
const { leads, whatsappChatRules, whatsappConversations, whatsappMessages } = await import("../src/lib/db/schema");
const { sweepReplyAlerts } = await import("../src/lib/whatsapp/reply-sweep");

const MARKER = "ReplySweepTest";
// Wednesday 12:00 IST, inside default opening hours.
const NOW = new Date("2026-11-18T06:30:00Z");
let leadId = "";

async function cleanup() {
  const rows = await db.select({ id: leads.id }).from(leads).where(sql`${leads.studentName} like ${MARKER + "%"}`);
  for (const r of rows) await db.delete(whatsappMessages).where(eq(whatsappMessages.leadId, r.id));
  await db.delete(whatsappConversations).where(eq(whatsappConversations.phone, "+919847730001"));
  await db.delete(leads).where(sql`${leads.studentName} like ${MARKER + "%"}`);
}

beforeAll(async () => {
  await cleanup();
  await db.update(whatsappChatRules).set({ alertEnabled: true, alertMinutes: 30, escalateMinutes: 120, autoAssignUnowned: false }).where(eq(whatsappChatRules.id, "default"));
  const [lead] = await db.insert(leads).values({ studentName: `${MARKER} A`, primaryPhone: "+919847730001" }).returning({ id: leads.id });
  leadId = lead.id;
  await db.insert(whatsappMessages).values({
    leadId, direction: "inbound", waMessageId: `in-${Date.now()}`, fromPhone: "+919847730001", toPhone: "x",
    messageType: "text", body: "hello", status: "received", occurredAt: new Date(NOW.getTime() - 60 * 60_000),
  });
});
afterAll(async () => {
  await cleanup();
  await db.update(whatsappChatRules).set({ alertEnabled: false }).where(eq(whatsappChatRules.id, "default"));
});

describe("sweepReplyAlerts", () => {
  it("alerts once for a message that has waited an hour", async () => {
    const first = await sweepReplyAlerts(NOW);
    expect(first.alerted).toBeGreaterThanOrEqual(1);
    expect(vi.mocked(notify).mock.calls.some((c) => c[0].eventKey === "whatsapp.reply_overdue")).toBe(true);
    const calls = vi.mocked(notify).mock.calls.length;
    await sweepReplyAlerts(NOW);
    expect(vi.mocked(notify).mock.calls.length).toBe(calls);
  });
  it("stays quiet once the conversation is resolved", async () => {
    await db.insert(whatsappConversations).values({ phone: "+919847730001", status: "resolved", resolvedAt: NOW });
    vi.mocked(notify).mockClear();
    // A later inbound would reopen it; none here, and level 2 is not yet due at 60 minutes anyway.
    await sweepReplyAlerts(new Date(NOW.getTime() + 90 * 60_000));
    expect(vi.mocked(notify).mock.calls.filter((c) => c[0].context.lead_name?.toString().startsWith(MARKER))).toHaveLength(0);
  });
});
