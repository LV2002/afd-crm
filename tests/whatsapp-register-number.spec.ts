/**
 * Re-registering a removed WhatsApp number — needs a real database:
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
const { whatsappNumbers } = await import("../src/lib/db/schema");
const { insertOrReviveNumber } = await import("../src/lib/whatsapp/register-number");

const ID = "waRegTest-1";
const values = {
  phoneNumberId: ID,
  label: "Broadcast",
  displayPhoneNumber: null,
  mode: "api" as const,
  counsellorId: null,
  createsLeads: false,
};

async function sweep() {
  await db.delete(whatsappNumbers).where(like(whatsappNumbers.phoneNumberId, "waRegTest-%"));
}
beforeAll(sweep);
afterAll(sweep);

describe("insertOrReviveNumber", () => {
  it("creates, then revives a removed row instead of hitting the unique index", async () => {
    expect((await insertOrReviveNumber(values)).outcome).toBe("created");

    await db
      .update(whatsappNumbers)
      .set({ deletedAt: new Date(), isActive: false })
      .where(eq(whatsappNumbers.phoneNumberId, ID));

    expect((await insertOrReviveNumber({ ...values, label: "Broadcast (again)" })).outcome).toBe("revived");

    const rows = await db.select().from(whatsappNumbers).where(eq(whatsappNumbers.phoneNumberId, ID));
    expect(rows).toHaveLength(1);
    expect(rows[0].deletedAt).toBeNull();
    expect(rows[0].isActive).toBe(true);
    expect(rows[0].label).toBe("Broadcast (again)");
  });
});
