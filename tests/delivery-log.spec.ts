/**
 * The per-endpoint delivery log — needs a real database:
 *   npm run db:migrate && npm test
 */
import { config as loadEnv } from "dotenv";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — see the file header for how to run this suite.");
}

const { db } = await import("../src/lib/db/client");
const { customWebhooks, webhookEvents } = await import("../src/lib/db/schema");
const { getDeliveryLog } = await import("../src/lib/integrations/delivery-log");

const SLUG = "deliverylogtest";
let endpointId = "";

async function sweep() {
  await db.delete(webhookEvents).where(like(webhookEvents.externalId, "deliverylogtest:%"));
  await db.delete(customWebhooks).where(eq(customWebhooks.slug, SLUG));
}
beforeAll(async () => {
  await sweep();
  const [row] = await db
    .insert(customWebhooks)
    .values({ name: "Delivery log test", slug: SLUG, source: "Test source", signingSecret: "x" })
    .returning({ id: customWebhooks.id });
  endpointId = row.id;
});
afterAll(sweep);

describe("getDeliveryLog", () => {
  it("names the endpoint, filters to it, and reads the person back, phone masked", async () => {
    await db.insert(webhookEvents).values([
      {
        source: "custom",
        customWebhookId: endpointId,
        externalId: "deliverylogtest:1",
        signatureOk: true,
        raw: { name: "Asha Nair", phone: "9847012345" },
        status: "failed",
        lastError: "No phone field found.",
        duplicateCount: 3,
      },
      {
        source: "custom",
        customWebhookId: endpointId,
        externalId: "deliverylogtest:2",
        signatureOk: false,
        raw: { name: "Rahul" },
        status: "failed",
        lastError: "Invalid or missing X-AFD-Signature",
      },
    ]);

    const rows = await getDeliveryLog({ days: 1, endpoint: `custom:${endpointId}` });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.channel === "Delivery log test")).toBe(true);

    const refused = rows.find((r) => r.outcome === "refused");
    const failed = rows.find((r) => r.outcome === "failed");
    expect(refused?.reason).toContain("X-AFD-Signature");
    expect(failed?.duplicates).toBe(3);
  });
});

describe("describeWhatsAppDelivery", () => {
  it("tells a delivery receipt from a customer's message, and whether it was saved", async () => {
    const { describeWhatsAppDelivery } = await import("../src/lib/integrations/delivery-log");

    expect(
      describeWhatsAppDelivery({ id: "wamid.1", status: "delivered", recipient_id: "919847012345" }, new Map()),
    ).toContain("Receipt: delivered");

    const message = { id: "wamid.2", from: "919847012345", type: "text", text: { body: "Hello, fees?" } };
    expect(describeWhatsAppDelivery(message, new Map([["wamid.2", false]]))).toContain("saved in Chats");
    expect(describeWhatsAppDelivery(message, new Map([["wamid.2", true]]))).toContain("saved, but hidden");
    expect(describeWhatsAppDelivery(message, new Map())).toContain("not saved to Chats");
    expect(describeWhatsAppDelivery(message, new Map())).toContain("Hello, fees?");
  });
});
