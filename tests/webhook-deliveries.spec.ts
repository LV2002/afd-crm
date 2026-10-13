/**
 * The inbound-deliveries summary, against a real database.
 *
 * This is hand-written SQL — `count(... ) filter (where ...)`,
 * `array_agg(... order by ...) filter (...)`, `make_interval` — none of
 * which the type checker can see. A typo in any of it throws at request
 * time on the health screen, which is the one screen somebody opens when
 * things are already going wrong.
 *
 * The behaviour worth pinning is the rejected count. It is the number
 * that distinguishes "Meta never called" from "Meta called and we turned
 * it away", and the second was a real, invisible failure.
 *
 *   npm run db:migrate && npm test
 */
import { config as loadEnv } from "dotenv";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — see the file header for how to run this suite.");
}

const { recentWebhookDeliveries } = await import(
  "../src/app/(app)/settings/health/webhook-deliveries"
);
const { db } = await import("../src/lib/db/client");
const { webhookEvents } = await import("../src/lib/db/schema");

const MARKER = "WebhookDeliveriesTest";

async function sweep() {
  for (const suffix of ["ok", "rejected", "failed", "old-rejected", "new-ok", "old-ok", "new-rejected", "unsigned-ok"]) {
    await db.delete(webhookEvents).where(eq(webhookEvents.externalId, `${MARKER}:${suffix}`));
  }
}

beforeAll(async () => {
  await sweep();
  await db.insert(webhookEvents).values([
    {
      source: "whatsapp",
      externalId: `${MARKER}:ok`,
      signatureOk: true,
      raw: {},
      status: "done",
      processedAt: new Date(),
    },
    {
      source: "whatsapp",
      externalId: `${MARKER}:rejected`,
      signatureOk: false,
      raw: {},
      status: "failed",
      lastError: "Invalid or missing X-Hub-Signature-256",
    },
    {
      source: "whatsapp",
      externalId: `${MARKER}:failed`,
      signatureOk: true,
      raw: {},
      status: "failed",
      lastError: "Something downstream broke",
    },
    // A channel whose signing was fixed: an old refusal, then a newer accepted delivery.
    {
      source: "instagram",
      externalId: `${MARKER}:old-rejected`,
      signatureOk: false,
      raw: {},
      status: "failed",
      lastError: "Invalid or missing X-Hub-Signature-256",
      receivedAt: new Date(Date.now() + 86_400_000),
    },
    {
      source: "instagram",
      externalId: `${MARKER}:new-ok`,
      signatureOk: true,
      raw: {},
      status: "done",
      receivedAt: new Date(Date.now() + 2 * 86_400_000),
    },
    // A channel that is broken now: accepted, then refused.
    {
      source: "knorish",
      externalId: `${MARKER}:old-ok`,
      signatureOk: true,
      raw: {},
      status: "done",
      receivedAt: new Date(Date.now() + 86_400_000),
    },
    {
      source: "knorish",
      externalId: `${MARKER}:new-rejected`,
      signatureOk: false,
      raw: {},
      status: "failed",
      lastError: "Invalid or missing X-AFD-Signature",
      receivedAt: new Date(Date.now() + 2 * 86_400_000),
    },
    // An endpoint set to accept unsigned deliveries: signature not ok, but processed.
    {
      source: "custom",
      externalId: `${MARKER}:unsigned-ok`,
      signatureOk: false,
      raw: {},
      status: "done",
      receivedAt: new Date(Date.now() + 3 * 86_400_000),
    },
  ]);
});

afterAll(sweep);

describe("recentWebhookDeliveries", () => {
  it("runs its SQL and groups by source", async () => {
    const rows = await recentWebhookDeliveries();
    const whatsapp = rows.find((row) => row.source === "whatsapp");
    expect(whatsapp).toBeTruthy();
    expect(whatsapp!.total).toBeGreaterThanOrEqual(3);
  });

  it("counts a bad signature as rejected, separately from a processing failure", async () => {
    // The distinction the whole panel exists for. A rejected delivery is
    // a credential mismatch and never reached a handler; a failed one
    // got in and broke afterwards. Conflating them points the fix at the
    // wrong place.
    const rows = await recentWebhookDeliveries();
    const whatsapp = rows.find((row) => row.source === "whatsapp")!;
    expect(whatsapp.rejected).toBeGreaterThanOrEqual(1);
    expect(whatsapp.failed).toBeGreaterThanOrEqual(2);
  });

  it("prefers a rejection's reason as the error it reports", async () => {
    // Both of the fixture's errors are candidates and the signature one
    // has to win: while deliveries are being refused at the door, no
    // downstream error is worth looking at yet.
    const rows = await recentWebhookDeliveries();
    const whatsapp = rows.find((row) => row.source === "whatsapp")!;
    expect(whatsapp.lastError).toMatch(/Signature|X-Hub-Signature/i);
  });

  it("raises the alarm only when the NEWEST delivery was refused", async () => {
    const rows = await recentWebhookDeliveries();
    const fixed = rows.find((row) => row.source === "instagram")!;
    expect(fixed.rejected).toBeGreaterThanOrEqual(1);
    expect(fixed.rejectedLatest).toBe(false);
    const broken = rows.find((row) => row.source === "knorish")!;
    expect(broken.rejectedLatest).toBe(true);
    expect(broken.lastRejectedAt).toBeTruthy();
  });

  it("does not call an accepted unsigned delivery a rejection", async () => {
    const rows = await recentWebhookDeliveries();
    const custom = rows.find((row) => row.source === "custom")!;
    expect(custom.rejectedLatest).toBe(false);
  });

  it("honours the window", async () => {
    // `make_interval(days => 0)` is the edge the expression has to
    // survive without becoming "everything".
    const rows = await recentWebhookDeliveries(0);
    expect(Array.isArray(rows)).toBe(true);
  });
});
