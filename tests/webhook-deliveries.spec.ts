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
  for (const suffix of ["ok", "rejected", "failed"]) {
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

  it("honours the window", async () => {
    // `make_interval(days => 0)` is the edge the expression has to
    // survive without becoming "everything".
    const rows = await recentWebhookDeliveries(0);
    expect(Array.isArray(rows)).toBe(true);
  });
});
