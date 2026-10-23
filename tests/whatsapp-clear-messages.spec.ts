/**
 * Clearing the WhatsApp inbox — needs a real database:
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
const { whatsappMessages } = await import("../src/lib/db/schema");
const { clearAllWhatsAppMessages, countLiveWhatsAppMessages } = await import("../src/lib/whatsapp/clear-messages");

const WA = "waClearTest-";
async function sweep() {
  await db.delete(whatsappMessages).where(like(whatsappMessages.waMessageId, `${WA}%`));
}
beforeAll(sweep);
afterAll(sweep);

describe("clearAllWhatsAppMessages", () => {
  it("hides messages without deleting them", async () => {
    const [a, b] = await db
      .insert(whatsappMessages)
      .values([
        { direction: "inbound", waMessageId: `${WA}1`, fromPhone: "+919000000001", toPhone: "+919000000002", body: "hi" },
        { direction: "inbound", waMessageId: `${WA}2`, fromPhone: "+919000000001", toPhone: "+919000000002", body: "hello" },
      ])
      .returning({ id: whatsappMessages.id });

    const before = await countLiveWhatsAppMessages();
    expect(before).toBeGreaterThanOrEqual(2);

    const hidden = await clearAllWhatsAppMessages();
    expect(hidden).toBeGreaterThanOrEqual(2);
    expect(await countLiveWhatsAppMessages()).toBe(0);

    // Still there, only hidden — recoverable.
    const [row] = await db.select().from(whatsappMessages).where(eq(whatsappMessages.id, a.id));
    expect(row.deletedAt).not.toBeNull();
    expect(b.id).toBeTruthy();
  });
});
