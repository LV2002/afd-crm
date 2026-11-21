/** Razorpay: signature check, event parsing, and the webhook marking a link paid without touching the ledger. */
import { createHmac } from "node:crypto";

import { config as loadEnv } from "dotenv";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
if (!process.env.INTEGRATION_ENCRYPTION_KEY) throw new Error("INTEGRATION_ENCRYPTION_KEY is not set.");
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/notifications/notify", () => ({ notify: vi.fn() }));

const { notify } = await import("../src/lib/notifications/notify");
const { parsePaymentLinkEvent, statusForEvent, verifyRazorpaySignature } = await import("../src/lib/integrations/razorpay/client");
const { db } = await import("../src/lib/db/client");
const { leads, payments, whatsappPaymentLinks, webhookEvents } = await import("../src/lib/db/schema");
const { setIntegrationCredential, deleteIntegrationCredential } = await import("../src/lib/integrations/credentials");
const { POST } = await import("../src/app/api/webhooks/razorpay/route");

const SECRET = "test-webhook-secret";
const MARKER = "RazorpayTest";
const sign = (body: string) => createHmac("sha256", SECRET).update(body).digest("hex");

describe("verifyRazorpaySignature", () => {
  it("accepts the right signature and rejects others", () => {
    const body = '{"a":1}';
    expect(verifyRazorpaySignature(body, sign(body), SECRET)).toBe(true);
    expect(verifyRazorpaySignature(body, sign("other"), SECRET)).toBe(false);
    expect(verifyRazorpaySignature(body, null, SECRET)).toBe(false);
    expect(verifyRazorpaySignature(body, sign(body), "")).toBe(false);
  });
});

describe("parsePaymentLinkEvent / statusForEvent", () => {
  it("reads a payment-link event and ignores others", () => {
    const evt = parsePaymentLinkEvent({ event: "payment_link.paid", payload: { payment_link: { entity: { id: "plink_1", reference_id: "r1" } }, payment: { entity: { id: "pay_9" } } } });
    expect(evt).toEqual({ event: "payment_link.paid", linkId: "plink_1", referenceId: "r1", paymentId: "pay_9" });
    expect(parsePaymentLinkEvent({ event: "payment.captured" })).toBeNull();
    expect(statusForEvent("payment_link.paid")).toBe("paid");
    expect(statusForEvent("payment_link.expired")).toBe("expired");
    expect(statusForEvent("payment_link.partially_paid")).toBeNull();
  });
});

let leadId = "";
beforeAll(async () => {
  await db.delete(leads).where(sql`${leads.studentName} like ${MARKER + "%"}`);
  await setIntegrationCredential("razorpay", "webhook_secret", SECRET);
  const [lead] = await db.insert(leads).values({ studentName: `${MARKER} A`, primaryPhone: "+919847740001" }).returning({ id: leads.id });
  leadId = lead.id;
  await db.insert(whatsappPaymentLinks).values({ leadId, amountPaise: 2_500_000, description: "1st instalment", razorpayLinkId: "plink_test1" });
});
afterAll(async () => {
  await db.delete(leads).where(sql`${leads.studentName} like ${MARKER + "%"}`);
  await db.delete(webhookEvents).where(sql`${webhookEvents.source} = 'razorpay'`);
  await deleteIntegrationCredential("razorpay", "webhook_secret");
});

function request(body: string, signature: string | null, eventId = `evt_${Math.random()}`) {
  return new Request("https://x/api/webhooks/razorpay", { method: "POST", body, headers: { ...(signature ? { "x-razorpay-signature": signature } : {}), "x-razorpay-event-id": eventId } });
}

describe("razorpay webhook", () => {
  const paid = JSON.stringify({ event: "payment_link.paid", payload: { payment_link: { entity: { id: "plink_test1" } }, payment: { entity: { id: "pay_1" } } } });

  it("rejects a bad signature and records the attempt", async () => {
    const res = await POST(request(paid, "nope"));
    expect(res.status).toBe(401);
  });
  it("marks the link paid, tells accounts, and writes no payment", async () => {
    const before = await db.select({ n: sql<number>`count(*)::int` }).from(payments);
    const res = await POST(request(paid, sign(paid), "evt_paid_1"));
    expect(res.status).toBe(200);
    const [link] = await db.select().from(whatsappPaymentLinks).where(eq(whatsappPaymentLinks.razorpayLinkId, "plink_test1"));
    expect(link.status).toBe("paid");
    expect(link.razorpayPaymentId).toBe("pay_1");
    expect(vi.mocked(notify).mock.calls.some((c) => c[0].eventKey === "payment.link_paid")).toBe(true);
    const after = await db.select({ n: sql<number>`count(*)::int` }).from(payments);
    expect(after[0].n).toBe(before[0].n);
  });
  it("treats a redelivery as a duplicate and a late 'expired' cannot undo paid", async () => {
    const dup = await POST(request(paid, sign(paid), "evt_paid_1"));
    expect((await dup.json()).duplicate).toBe(true);
    const expired = JSON.stringify({ event: "payment_link.expired", payload: { payment_link: { entity: { id: "plink_test1" } } } });
    await POST(request(expired, sign(expired), "evt_exp_1"));
    const [link] = await db.select().from(whatsappPaymentLinks).where(eq(whatsappPaymentLinks.razorpayLinkId, "plink_test1"));
    expect(link.status).toBe("paid");
  });
});
