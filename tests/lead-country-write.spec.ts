/**
 * The jsonb merge the new-lead form uses to store Country — needs a real
 * database:   npm run db:migrate && npm test
 *
 * The server action itself needs a signed-in session, so this pins the part
 * that can go wrong in SQL: that country is added to a lead's custom values
 * without replacing what is already there.
 */
import { config as loadEnv } from "dotenv";
import { eq, like, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — see the file header for how to run this suite.");
}

const { db } = await import("../src/lib/db/client");
const { leads } = await import("../src/lib/db/schema");

const MARKER = "LeadCountryWriteTest";

async function sweep() {
  await db.delete(leads).where(like(leads.studentName, `${MARKER}%`));
}
beforeAll(sweep);
afterAll(sweep);

async function writeCountry(id: string, value: Record<string, string>) {
  await db
    .update(leads)
    .set({ custom: sql`coalesce(${leads.custom}, '{}'::jsonb) || ${JSON.stringify(value)}::jsonb` })
    .where(eq(leads.id, id));
  const [row] = await db.select({ custom: leads.custom }).from(leads).where(eq(leads.id, id));
  return row.custom as Record<string, unknown>;
}

describe("storing Country on a new lead", () => {
  it("works on a lead with no custom values yet", async () => {
    const [lead] = await db
      .insert(leads)
      .values({ studentName: `${MARKER} a`, primaryPhone: "+919800066601" })
      .returning({ id: leads.id });
    expect(await writeCountry(lead.id, { country: "uae" })).toEqual({ country: "uae" });
  });

  it("keeps what was already there, and stores the named country for Others", async () => {
    const [lead] = await db
      .insert(leads)
      .values({ studentName: `${MARKER} b`, primaryPhone: "+919800066602", custom: { hobby: "sketching" } })
      .returning({ id: leads.id });
    expect(await writeCountry(lead.id, { country: "others", country_other: "Bahrain" })).toEqual({
      hobby: "sketching",
      country: "others",
      country_other: "Bahrain",
    });
  });

  it("is safe with quotes in the typed country name", async () => {
    const [lead] = await db
      .insert(leads)
      .values({ studentName: `${MARKER} c`, primaryPhone: "+919800066603" })
      .returning({ id: leads.id });
    const custom = await writeCountry(lead.id, { country: "others", country_other: `Côte d'Ivoire "CI"` });
    expect(custom.country_other).toBe(`Côte d'Ivoire "CI"`);
  });
});
